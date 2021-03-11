import {
  applicationPromptType,
  clozePromptType,
  PromptType,
  qaPromptType,
} from "../types/prompt";

export default function promptTypeSupportsRetry(
  promptType: PromptType,
): boolean {
  switch (promptType) {
    case qaPromptType:
    case clozePromptType:
      return true;
    case applicationPromptType:
      return false;
  }
}
