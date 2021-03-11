import {
  AttachmentResolutionMap,
  PromptOf,
  PromptParametersOf,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "@withorbit/core";

export interface ReviewItem<PT extends PromptTask = PromptTask> {
  prompt: PromptOf<PT>;
  promptParameters: PromptParametersOf<PT>;
  promptState: PromptState<PT> | null;
  attachmentResolutionMap: AttachmentResolutionMap | null;

  promptTaskID: PromptTaskID; // cached but computable from above properties
}
