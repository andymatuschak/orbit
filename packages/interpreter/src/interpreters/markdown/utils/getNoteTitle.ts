import mdast from "mdast";
import { processor } from "../markdown.js";

export function getNoteTitle(noteRoot: mdast.Root): string | null {
  if (noteRoot.children.length > 0) {
    // filter out yaml frontmatter
    const firstNode = noteRoot.children.filter((n) => n.type !== "yaml")[0];
    if (firstNode.type === "heading") {
      return processor
        .stringify({
          type: "root",
          children: firstNode.children,
        })
        .trimEnd();
    } else {
      return processor
        .stringify({ type: "root", children: [firstNode] })
        .trimEnd();
    }
  } else {
    return null;
  }
}
