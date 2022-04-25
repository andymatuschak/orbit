import unist from "unist";
import mdast from "mdast";
import { processor } from "../markdown";

export function getNoteTitle(noteRoot: mdast.Root): string | null {
  if (noteRoot.children.length > 0) {
    const firstNode = noteRoot.children[0];
    if (firstNode.type === "heading") {
      return (
        processor
          .stringify({
            type: "paragraph",
            children: firstNode.children,
          } as unist.Node)
          // @ts-expect-error typings are wrong for this function
          .trimRight()
      );
    } else {
      return (
        processor
          .stringify(firstNode)
          // @ts-expect-error typings are wrong for this function
          .trimRight()
      );
    }
  } else {
    return null;
  }
}
