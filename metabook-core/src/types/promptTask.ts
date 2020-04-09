// A *task* is the atomic unit whose state is tracked in the system. A prompt task is a task about a prompt. Applications prompts comprise multiple variants, but those variants are not different tasks because all those variants share the same state. A cloze task is drawn from a cloze prompt: each individual deletion range is a task, since its state is tracked distinctly.

import { PromptID } from "../promptID";

interface BasePromptTask<PromptParametersType extends PromptParameters> {
  promptID: PromptID;
  promptParameters: PromptParametersType;
}

export type BasicPromptTask = BasePromptTask<BasicPromptParameters>;
export type ApplicationPromptTask = BasePromptTask<ApplicationPromptParameters>;
export type ClozePromptTask = BasePromptTask<ClozePromptParameters>;
export type PromptTask =
  | BasicPromptTask
  | ApplicationPromptTask
  | ClozePromptTask;

export type BasicPromptParameters = null;
export type ApplicationPromptParameters = null;
export interface ClozePromptParameters {
  clozeIndex: number;
}
export type PromptParameters =
  | BasicPromptParameters
  | ApplicationPromptParameters
  | ClozePromptParameters;

export type PromptTaskID = string & { __promptTaskIDOpaqueType: never };

// TODO: is this function really needed? it's not safe!
export function decodePromptTask(
  promptTaskID: PromptTaskID,
): PromptTask | null {
  const components = promptTaskID.split("/");
  if (components.length === 1) {
    return {
      promptID: components[0] as PromptID,
      promptParameters: null,
    };
  } else if (components.length === 2) {
    const childIndex = Number.parseInt(components[1]);
    if (isNaN(childIndex)) {
      return null;
    } else {
      return {
        promptID: components[0] as PromptID,
        promptParameters: {
          clozeIndex: childIndex,
        },
      };
    }
  } else {
    return null;
  }
}

export function encodePromptTask(prompt: PromptTask): PromptTaskID {
  return (prompt.promptParameters
    ? `${prompt.promptID}/${prompt.promptParameters.clozeIndex}`
    : prompt.promptID) as PromptTaskID;
}
