import {
  PromptOf,
  PromptParametersOf,
  PromptState,
  PromptTask,
  PromptTaskID,
} from "metabook-core";
import { AttachmentResolutionMap } from "metabook-ui";

export interface ReviewItem<PT extends PromptTask = PromptTask> {
  prompt: PromptOf<PT>;
  promptParameters: PromptParametersOf<PT>;
  promptState: PromptState<PT> | null;
  attachmentResolutionMap: AttachmentResolutionMap;

  promptTaskID: PromptTaskID; // cached but computable from above properties
}
