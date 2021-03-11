// Prompt and PromptTaskParameters need to be the same subtypes, but I don't have a good way to express that in the type system.

import {
  applicationPromptType,
  clozePromptType,
  Prompt,
  qaPromptType,
} from "./types/prompt";
import {
  ApplicationPromptTaskParameters,
  PromptTaskParameters,
} from "./types/promptTask";

export default function getNextTaskParameters(
  prompt: Prompt,
  promptTaskParameters: PromptTaskParameters | null,
): PromptTaskParameters {
  switch (prompt.promptType) {
    case qaPromptType:
    case clozePromptType:
      return null;
    case applicationPromptType:
      if (promptTaskParameters === null) {
        return {
          variantIndex: 0,
        };
      } else {
        return {
          variantIndex:
            ((promptTaskParameters as ApplicationPromptTaskParameters)
              .variantIndex +
              1) %
            prompt.variants.length,
        };
      }
  }
}
