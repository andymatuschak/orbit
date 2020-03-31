// See discussion in promptSpec for more on the difference between prompts and prompt specs.

import { PromptSpecID } from "./identifiers";

export interface PromptID {
  promptSpecID: PromptSpecID;
  childIndex: number | null;
}

export type EncodedPromptID = string & { __encodedPromptIDOpaqueType: never };

export function decodePromptID(
  promptIDString: EncodedPromptID,
): PromptID | null {
  const components = promptIDString.split("/");
  if (components.length === 1) {
    return {
      promptSpecID: components[0] as PromptSpecID,
      childIndex: null,
    };
  } else if (components.length === 2) {
    const childIndex = Number.parseInt(components[1]);
    if (isNaN(childIndex)) {
      return null;
    } else {
      return {
        promptSpecID: components[0] as PromptSpecID,
        childIndex,
      };
    }
  } else {
    return null;
  }
}

export function encodePromptID(promptID: PromptID): EncodedPromptID {
  return (promptID.childIndex === null
    ? promptID.promptSpecID
    : `${promptID.promptSpecID}/${promptID.childIndex}`) as EncodedPromptID;
}
