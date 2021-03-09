import * as fs from "fs";
import mdast from "mdast";
import { selectAll } from "unist-util-select";
import { BearIDNode, bearIDNodeType } from "./bearIDPlugin";
import { processor } from "./index";
import { JsonMap } from "./util/JSONTypes";

export async function listNoteFiles(folderPath: string): Promise<string[]> {
  const noteDirectoryEntries = await fs.promises.readdir(folderPath, {
    withFileTypes: true,
  });
  return noteDirectoryEntries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        entry.name.endsWith(".md")
    )
    .map((entry) => entry.name);
}

export interface NoteID extends JsonMap {
  type: string;
  id: string;
  openURL: string | null;
}

function getOpenURLForBearID(bearID: string): string {
  return `bear://x-callback-url/open-note?id=${bearID}`;
}

export function getNoteID(noteRoot: mdast.Root): NoteID | null {
  const bearNoteIDNodes = selectAll(bearIDNodeType, noteRoot);

  if (bearNoteIDNodes.length === 1) {
    const bearID = (bearNoteIDNodes[0] as BearIDNode).bearID;
    return { type: "bear", id: bearID, openURL: getOpenURLForBearID(bearID) };
  } else if (bearNoteIDNodes.length > 1) {
    console.debug("Multiple Bear note IDs in note", noteRoot, bearNoteIDNodes);
    return null;
  } else {
    return null;
  }
}

export function getNoteTitle(noteRoot: mdast.Root): string | null {
  if (noteRoot.children.length > 0) {
    const firstNode = noteRoot.children[0];
    if (firstNode.type === "heading") {
      return processor.stringify({
        type: "paragraph",
        children: firstNode.children,
      });
    } else {
      return processor.stringify(firstNode);
    }
  } else {
    return null;
  }
}
