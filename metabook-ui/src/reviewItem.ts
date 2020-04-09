import {
  ApplicationPromptParameters,
  ApplicationPrompt,
  ApplicationPromptState,
  AttachmentID,
  AttachmentURLReference,
  BasicPromptParameters,
  BasicPrompt,
  BasicPromptState,
  ClozePrompt,
  ClozePromptParameters,
  ClozePromptState,
} from "metabook-core";

export const promptReviewItemType = "prompt";
export type AttachmentResolutionMap = Map<AttachmentID, AttachmentURLReference>;

interface BasePromptReviewItem {
  reviewItemType: typeof promptReviewItemType;
  attachmentResolutionMap: AttachmentResolutionMap | null;
}

export interface BasicPromptReviewItem extends BasePromptReviewItem {
  prompt: BasicPrompt;
  promptParameters: BasicPromptParameters;
  promptState: BasicPromptState | null;
}

export interface ApplicationPromptReviewItem extends BasePromptReviewItem {
  prompt: ApplicationPrompt;
  promptParameters: ApplicationPromptParameters;
  promptState: ApplicationPromptState | null;
}

export interface ClozePromptReviewItem extends BasePromptReviewItem {
  prompt: ClozePrompt;
  promptParameters: ClozePromptParameters;
  promptState: ClozePromptState | null;
}

export type PromptReviewItem =
  | BasicPromptReviewItem
  | ApplicationPromptReviewItem
  | ClozePromptReviewItem;

export type ReviewItem = PromptReviewItem /* | LoginReviewTask TODO */;
