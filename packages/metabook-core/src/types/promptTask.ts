// A *task* is the atomic unit whose state is tracked in the system. A prompt task is a task about a prompt. Applications prompts comprise multiple variants, but those variants are not different tasks because all those variants share the same state. A cloze task is drawn from a cloze prompt: each individual deletion range is a task, since its state is tracked distinctly.
// A task ID is a string representation of a task, e.g. `clozePrompt/SOME_CID_HERE/3`.

import { PromptID } from "../promptID";
import {
  ApplicationPrompt,
  applicationPromptType,
  ClozePrompt,
  clozePromptType,
  Prompt,
  QAPrompt,
  qaPromptType,
} from "./prompt";
import { PromptProvenance } from "./promptProvenance";
import { TaskMetadata } from "./taskMetadata";

export interface AbstractPromptTask<P extends Prompt, PP> {
  promptID: PromptID;
  promptType: P["promptType"];
  promptParameters: PP;
}

export type QAPromptTask = AbstractPromptTask<QAPrompt, null>;

export type ApplicationPromptTask = AbstractPromptTask<ApplicationPrompt, null>;

export type ClozePromptTask = AbstractPromptTask<
  ClozePrompt,
  ClozePromptParameters
>;

export type PromptTask = QAPromptTask | ApplicationPromptTask | ClozePromptTask;

export interface ClozePromptParameters {
  clozeIndex: number;
}
export type PromptParameters = PromptTask extends AbstractPromptTask<
  any,
  infer PP
>
  ? PP
  : never;

export interface PromptTaskMetadata extends TaskMetadata {
  provenance: PromptProvenance | null;
}

export type PromptTaskID = string & { __promptTaskIDOpaqueType: never };

export function getPromptTaskForID(
  promptTaskID: PromptTaskID,
): PromptTask | Error {
  const components = promptTaskID.split("/");
  if (components.length < 2) {
    return new Error("Prompt task IDs must have at least 2 components");
  }
  const promptID = components[1] as PromptID;
  switch (components[0]) {
    case qaPromptType:
      if (components.length === 2) {
        return {
          promptID,
          promptType: qaPromptType,
          promptParameters: null,
        };
      } else {
        return new Error("Task ID has too many components");
      }
    case applicationPromptType:
      if (components.length === 2) {
        return {
          promptID,
          promptType: applicationPromptType,
          promptParameters: null,
        };
      } else {
        return new Error("Task ID has too many components");
      }
    case clozePromptType:
      if (components.length === 3) {
        return {
          promptID,
          promptType: clozePromptType,
          promptParameters: { clozeIndex: Number.parseInt(components[2]) },
        };
      } else {
        return new Error("Task ID has too many components");
      }
    default:
      return new Error("Unknown prompt type");
  }
}

export function getIDForPromptTask(promptTask: PromptTask): PromptTaskID {
  const base = `${promptTask.promptType}/${promptTask.promptID}`;
  switch (promptTask.promptType) {
    case qaPromptType:
    case applicationPromptType:
      return base as PromptTaskID;
    case clozePromptType:
      return `${base}/${promptTask.promptParameters.clozeIndex}` as PromptTaskID;
  }
}
