// A *prompt* is the atomic unit whose state is tracked in the system. Applications prompts comprise multiple variants, but those variants are not prompts because they share the state of their parent prompt. A cloze task is drawn from a cloze prompt *group*: each individual deletion is a prompt, since its state is tracked distinctly.

import { PromptSpecID } from "../promptSpecID";

interface BasePrompt<PromptParametersType extends PromptParameters> {
  promptSpecID: PromptSpecID;
  promptParameters: PromptParametersType;
}

export type BasicPrompt = BasePrompt<BasicPromptParameters>;
export type ApplicationPrompt = BasePrompt<ApplicationPromptParameters>;
export type ClozePrompt = BasePrompt<ClozePromptParameters>;
export type Prompt = BasicPrompt | ApplicationPrompt | ClozePrompt;

export type BasicPromptParameters = null;
export type ApplicationPromptParameters = null;
export interface ClozePromptParameters {
  clozeIndex: number;
}
export type PromptParameters =
  | BasicPromptParameters
  | ApplicationPromptParameters
  | ClozePromptParameters;

export type PromptID = string & { __promptIDOpaqueType: never };

// TODO: is this function really needed? it's not safe!
export function decodePrompt(promptID: PromptID): Prompt | null {
  const components = promptID.split("/");
  if (components.length === 1) {
    return {
      promptSpecID: components[0] as PromptSpecID,
      promptParameters: null,
    };
  } else if (components.length === 2) {
    const childIndex = Number.parseInt(components[1]);
    if (isNaN(childIndex)) {
      return null;
    } else {
      return {
        promptSpecID: components[0] as PromptSpecID,
        promptParameters: {
          clozeIndex: childIndex,
        },
      };
    }
  } else {
    return null;
  }
}

export function encodePrompt(prompt: Prompt): PromptID {
  return (prompt.promptParameters
    ? `${prompt.promptSpecID}/${prompt.promptParameters.clozeIndex}`
    : prompt.promptSpecID) as PromptID;
}
