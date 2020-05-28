// A *task* is the atomic unit whose state is tracked in the system. A prompt task is a task about a prompt. Applications prompts comprise multiple variants, but those variants are not different tasks because all those variants share the same state. A cloze task is drawn from a cloze prompt: each individual deletion range is a task, since its state is tracked distinctly.

import { PromptID } from "../promptID";
import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
} from "./prompt";
import { PromptProvenance } from "./promptProvenance";
import { TaskMetadata } from "./taskMetadata";

export interface BasicPromptTask {
  promptID: PromptID;
  promptType: typeof basicPromptType;
  promptParameters: BasicPromptParameters;
}

export interface ApplicationPromptTask {
  promptID: PromptID;
  promptType: typeof applicationPromptType;
  promptParameters: ApplicationPromptParameters;
}

export interface ClozePromptTask {
  promptID: PromptID;
  promptType: typeof clozePromptType;
  promptParameters: ClozePromptParameters;
}

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
  const promptID = components[0] as PromptID;
  switch (components[1]) {
    case basicPromptType:
      if (components.length === 2) {
        return {
          promptID,
          promptType: basicPromptType,
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
  const base = `${promptTask.promptID}/${promptTask.promptType}`;
  switch (promptTask.promptType) {
    case basicPromptType:
    case applicationPromptType:
      return base as PromptTaskID;
    case clozePromptType:
      return `${base}/${promptTask.promptParameters.clozeIndex}` as PromptTaskID;
  }
}
