import { getIDForPromptSpec, PromptSpecID, PromptTask } from "metabook-core";
import { PromptID } from "metabook-core";

// Hack for https://github.com/microsoft/TypeScript/issues/28339
type _PromptTaskID<T> = T extends PromptTask
  ? Omit<T, "spec"> & {
      promptSpecID: PromptSpecID;
      promptSpecType: T["spec"]["promptSpecType"];
    }
  : never;

export type PromptTaskID = _PromptTaskID<PromptTask>;

export function getIDForPromptTask<P extends PromptTask>(
  promptTask: P,
): PromptTaskID {
  const { spec, ...others } = { ...promptTask };
  return {
    ...others,
    promptSpecID: getIDForPromptSpec(spec),
    promptSpecType: promptTask.spec.promptSpecType,
  } as PromptTaskID;
}

// There's a many-to-one relationship between PromptTaskIDs and PromptIDs.
export function getPromptIDForPromptTaskID(
  promptTaskID: PromptTaskID,
): PromptID {
  switch (promptTaskID.promptSpecType) {
    case "basic":
    case "applicationPrompt":
      return { promptSpecID: promptTaskID.promptSpecID, childIndex: null };
    case "cloze":
      return {
        promptSpecID: promptTaskID.promptSpecID,
        childIndex: promptTaskID.clozeIndex,
      };
  }
}
