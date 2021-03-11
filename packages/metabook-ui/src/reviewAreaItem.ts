import {
  AttachmentResolutionMap,
  getIDForPromptSync,
  getIDForPromptTask,
  PromptOf,
  PromptParametersOf,
  PromptProvenance,
  PromptTask,
  PromptTaskID,
  PromptTaskParametersOf,
} from "@withorbit/core";
import { colors } from "./styles";

export interface ReviewAreaItem<PT extends PromptTask = PromptTask> {
  prompt: PromptOf<PT>;
  promptParameters: PromptParametersOf<PT>;
  taskParameters: PromptTaskParametersOf<PT>;
  attachmentResolutionMap: AttachmentResolutionMap | null;

  provenance: PromptProvenance | null;
  colorPalette: colors.ColorPalette;
}

export function getPromptTaskIDForReviewItem<PT extends PromptTask>(
  reviewItem: ReviewAreaItem<PT>,
): PromptTaskID {
  // I don't understand why all this casting is necessary here. TypeScript is having trouble with some of the fancy generic inference going on here.
  const promptTask = {
    promptType: reviewItem.prompt.promptType as PT["promptType"],
    promptID: getIDForPromptSync(reviewItem.prompt),
    promptParameters: reviewItem.promptParameters as PT["promptParameters"],
  } as PT;
  return getIDForPromptTask(promptTask);
}
