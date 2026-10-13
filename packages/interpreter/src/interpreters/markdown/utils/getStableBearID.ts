import mdast from "mdast";
import * as unistUtilSelect from "unist-util-select";
import { BearIDNode, bearIDNodeType } from "../plugins/bearIDPlugin.js";

function getOpenURLForBearID(bearID: string): string {
  return `bear://x-callback-url/open-note?id=${bearID}`;
}

export type BearID = { id: string; openURL: string };
export function getStableBearID(noteRoot: mdast.Root): BearID | null {
  const bearNoteIDNodes = unistUtilSelect.selectAll(bearIDNodeType, noteRoot);
  if (bearNoteIDNodes.length === 1) {
    const bearID = (bearNoteIDNodes[0] as BearIDNode).bearID;
    return { id: bearID, openURL: getOpenURLForBearID(bearID) };
  } else if (bearNoteIDNodes.length > 1) {
    console.debug("Multiple Bear note IDs in note", noteRoot, bearNoteIDNodes);
    return null;
  } else {
    return null;
  }
}
