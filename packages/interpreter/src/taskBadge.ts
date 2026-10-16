import type { TaskID } from "@withorbit/core";
import type { Link, Nodes, Root, RootContent } from "mdast";
import { walkMarkdown } from "./markdown.js";

/** A badge is metadata only when both its label and URL reserve it for Orbit. */
function badges(nodes: readonly RootContent[]): Link[] {
  return nodes.flatMap((node) =>
    [...walkMarkdown(node)].filter(
      (child): child is Link =>
        child.type === "link" &&
        text(child) === "☉" &&
        /^orbit:/i.test(child.url),
    ),
  );
}

function text(node: Nodes): string {
  if ("value" in node) return node.value;
  return "children" in node ? node.children.map(text).join("") : "";
}

function badgeTaskID(badge: Link): TaskID {
  const match = /^orbit:\/\/(?:task\/)?([A-Za-z0-9_-]{22})$/i.exec(badge.url);
  if (!match)
    throw new Error(
      `Invalid Orbit task badge URL ${JSON.stringify(badge.url)}; expected orbit://task/ followed by a 22-character task ID`,
    );
  return match[1] as TaskID;
}

function lastContent(nodes: readonly Nodes[]): Nodes | undefined {
  for (const node of [...nodes].reverse()) {
    if (node.type === "text" && !node.value.trim()) continue;
    // A cloze is learning content, not a container for task-level metadata.
    if ("children" in node && node.type !== "link" && node.type !== "cloze") {
      const child = lastContent(node.children);
      if (child) return child;
    } else return node;
  }
  return undefined;
}

/** Remove a final metadata link without changing the source AST or rendering. */
export function stripTaskBadge(nodes: readonly RootContent[]): {
  nodes: RootContent[];
  taskID?: TaskID;
  badge?: Link;
} {
  const found = badges(nodes);
  if (found.length > 1)
    throw new Error("A prompt cannot contain multiple Orbit task badges");
  const badge = found[0];
  if (!badge) return { nodes: [...nodes] };
  const taskID = badgeTaskID(badge);
  if (lastContent(nodes) !== badge)
    throw new Error("An Orbit task badge must be at the end of its prompt");
  return {
    nodes: withoutTaskBadges({ type: "root", children: [...nodes] }, [badge])
      .children,
    taskID,
    badge,
  };
}

/** Catch badges in questions, ordinary prose, or detached paragraphs. */
export function validateTaskBadges(
  root: Root,
  accepted: readonly Link[],
  definitionsRoot = root,
): void {
  // Reference links are deliberately unsupported metadata: accepting one as
  // ordinary content would quietly create a new hash-identified task instead.
  // Definitions can occur anywhere in the original note, even Backlinks.
  const definitions = new Map<string, string>();
  for (const node of walkMarkdown(definitionsRoot)) {
    if (node.type !== "definition") continue;
    const key = node.identifier.toUpperCase();
    if (!definitions.has(key)) definitions.set(key, node.url);
  }
  for (const node of walkMarkdown(root)) {
    if (
      node.type === "linkReference" &&
      text(node) === "☉" &&
      /^orbit:/i.test(definitions.get(node.identifier.toUpperCase()) ?? "")
    )
      throw new Error(
        "Orbit task badges must use inline links such as [☉](orbit://task/ID), not reference links",
      );
  }
  const allowed = new Set(accepted);
  for (const badge of badges(root.children)) {
    badgeTaskID(badge);
    if (!allowed.has(badge))
      throw new Error(
        "An Orbit task badge must end a Q&A answer or a cloze block, not appear in a question or a separate prose paragraph",
      );
  }
}

/** Also use the cleaned tree for source titles, including headingless notes. */
export function withoutTaskBadges(root: Root, accepted: readonly Link[]): Root {
  if (!accepted.length) return root;
  const removed = new Set<Nodes>(accepted);
  function visit(node: Nodes): Nodes | undefined {
    if (removed.has(node)) return undefined;
    if (!("children" in node)) return node;
    const children = node.children.map(visit).filter((child) => !!child);
    if (
      children.length === node.children.length &&
      children.every((child, index) => child === node.children[index])
    )
      return node;
    // A marker's separating whitespace is metadata too. Drop empty trailing
    // paragraphs (for multiblock answers), but preserve all untouched nodes.
    while (children.length) {
      const last = children[children.length - 1];
      if (last.type === "break") {
        children.pop();
        continue;
      }
      if (last.type !== "text") break;
      const value = last.value.trimEnd();
      if (value) {
        children[children.length - 1] = { ...last, value };
        break;
      }
      children.pop();
    }
    return children.length || node.type === "root"
      ? ({ ...node, children } as Nodes)
      : undefined;
  }
  return visit(root) as Root;
}
