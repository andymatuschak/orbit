import { isDeepStrictEqual } from "node:util";
import type { IngestionAssignment } from "@withorbit/ingester";
import { analyzeMarkdownFile, type MarkdownFile } from "./interpret.js";

/** Insert supplied task identities without reformatting the source. */
export function stampMarkdownFile(
  file: MarkdownFile,
  assignments: readonly IngestionAssignment[],
): string {
  const { source, prompts } = analyzeMarkdownFile(file);
  const byItem = new Map<string, IngestionAssignment>();
  const taskIDs = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.sourceIdentifier !== source.identifier) continue;
    if (!/^[A-Za-z0-9_-]{22}$/.test(assignment.taskID))
      throw new Error(`Invalid task ID for source ${file.name}`);
    if (byItem.has(assignment.itemIdentifier) || taskIDs.has(assignment.taskID))
      throw new Error(`Duplicate task assignment for source ${file.name}`);
    byItem.set(assignment.itemIdentifier, assignment);
    taskIDs.add(assignment.taskID);
  }

  const expectedIDs: IngestionAssignment["taskID"][] = [];
  const edits: { offset: number; text: string }[] = [];
  const newline = file.content.includes("\r\n") ? "\r\n" : "\n";
  for (const { item, range, separateParagraph } of prompts) {
    const assignment = byItem.get(item.identifier);
    if (!assignment)
      throw new Error(`Missing task assignment for a prompt in ${file.name}`);
    byItem.delete(item.identifier);
    if (item.taskID && item.taskID !== assignment.taskID)
      throw new Error(
        `Task assignment does not match an existing badge in ${file.name}`,
      );
    expectedIDs.push(assignment.taskID);
    if (!item.taskID)
      edits.push({
        offset: range.end,
        text: `${separateParagraph ? newline + newline : " "}[☉](orbit://task/${assignment.taskID})`,
      });
  }
  if (byItem.size)
    throw new Error(
      `Task assignments do not match the prompts in ${file.name}`,
    );

  let content = file.content;
  for (const edit of edits.sort((a, b) => b.offset - a.offset))
    content =
      content.slice(0, edit.offset) + edit.text + content.slice(edit.offset);

  // Source ranges are precise, but Markdown layout can make an insertion mean
  // something else. Never return a rewrite that changes the imported content.
  const stamped = analyzeMarkdownFile({ ...file, content }).source;
  const { items, ...identity } = source;
  const { items: stampedItems, ...stampedIdentity } = stamped;
  if (
    !isDeepStrictEqual(identity, stampedIdentity) ||
    stampedItems.length !== items.length ||
    stampedItems.some(
      (item, index) =>
        item.taskID !== expectedIDs[index] ||
        !isDeepStrictEqual(item.spec, items[index].spec),
    )
  )
    throw new Error(`Cannot safely stamp this Markdown layout in ${file.name}`);
  return content;
}
