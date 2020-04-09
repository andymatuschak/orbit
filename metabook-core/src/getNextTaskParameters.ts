// PromptSpec and PromptTaskParameters need to be the same subtypes, but I don't have a good way to express that in the type system.

import { PromptSpec } from "./types/promptSpec";
import {
  ApplicationPromptTaskParameters,
  PromptTaskParameters,
} from "./types/promptTaskParameters";

export default function getNextTaskParameters(
  promptSpec: PromptSpec,
  promptTaskParameters: PromptTaskParameters | null,
): PromptTaskParameters {
  switch (promptSpec.promptSpecType) {
    case "basic":
    case "cloze":
      return null;
    case "applicationPrompt":
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
            promptSpec.variants.length,
        };
      }
  }
}
