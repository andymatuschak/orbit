// A *task* is the atomic unit whose state is tracked in the system. A prompt task is a task about a prompt, possibly parameterized with prompt parameters.
// A cloze prompt task is drawn from a cloze prompt: each individual deletion range is a task, since its state is tracked distinctly. The tasks are created by parameterizing the cloze prompt with a cloze index via the prompt parameters.
// In addition to prompt parameters, there may be task parameters, which determine which variation of a given task should be shown. For instance, application prompts comprise multiple variants, but those variants are not different tasks because all those variants share the same state. Instead, the variant index is tracked in the state of the prompt task).
// A task ID is a string representation of a task, encoding its type, the prompt ID, and the prompt parameters: e.g. `clozePrompt/SOME_CID_HERE/3`.

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

export type AbstractPromptTask<
  P extends Prompt,
  PromptParametersType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  PromptTaskParametersType
> = {
  promptID: PromptID;
  promptType: P["promptType"];
  promptParameters: PromptParametersType;
};
export type PromptOf<PT extends PromptTask> = PT extends AbstractPromptTask<
  infer P,
  any,
  any
>
  ? P
  : never;
export type PromptParametersOf<
  PT extends PromptTask
> = PT extends AbstractPromptTask<any, infer PP, any> ? PP : never;
export type PromptTaskParametersOf<
  PT extends PromptTask
> = PT extends AbstractPromptTask<any, any, infer PTP> ? PTP : never;

export type QAPromptTask = AbstractPromptTask<QAPrompt, null, null>;

export type ApplicationPromptTask = AbstractPromptTask<
  ApplicationPrompt,
  null,
  ApplicationPromptTaskParameters
>;

export type ClozePromptTask = AbstractPromptTask<
  ClozePrompt,
  ClozePromptParameters,
  null
>;

export type PromptTask = QAPromptTask | ApplicationPromptTask | ClozePromptTask;

export interface ClozePromptParameters {
  clozeIndex: number;
}
export type PromptParameters = PromptParametersOf<PromptTask>;

export interface PromptTaskMetadata extends TaskMetadata {
  provenance: PromptProvenance | null;
}

export type PromptTaskID = string & { __promptTaskIDOpaqueType: never };

function tooManyComponentsError(promptTaskID: PromptTaskID): Error {
  return new Error(
    `Can't parse ${promptTaskID}: task ID has too many components`,
  );
}

export function getPromptTaskForID(
  promptTaskID: PromptTaskID,
): PromptTask | Error {
  const components = promptTaskID.split("/");
  if (components.length < 2) {
    return new Error(
      `Can't parse ${promptTaskID}: prompt task IDs must have at least 2 components`,
    );
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
        return tooManyComponentsError(promptTaskID);
      }
    case applicationPromptType:
      if (components.length === 2) {
        return {
          promptID,
          promptType: applicationPromptType,
          promptParameters: null,
        };
      } else {
        return tooManyComponentsError(promptTaskID);
      }
    case clozePromptType:
      if (components.length === 3) {
        return {
          promptID,
          promptType: clozePromptType,
          promptParameters: { clozeIndex: Number.parseInt(components[2]) },
        };
      } else {
        return tooManyComponentsError(promptTaskID);
      }
    default:
      return new Error(`Can't parse ${promptTaskID}: unknown prompt type`);
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

export type ApplicationPromptTaskParameters = {
  variantIndex: number;
};

export type PromptTaskParameters = PromptTaskParametersOf<PromptTask>;
