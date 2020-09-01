import {
  ApplicationPromptParameters,
  ApplicationPrompt,
  AttachmentID,
  AttachmentURLReference,
  BasicPromptParameters,
  BasicPrompt,
  ClozePrompt,
  ClozePromptParameters,
  PromptState,
} from "metabook-core";

export const promptReviewItemType = "prompt";
export type AttachmentResolutionMap = Map<AttachmentID, AttachmentURLReference>;

interface BasePromptReviewItem {
  reviewItemType: typeof promptReviewItemType;
  attachmentResolutionMap: AttachmentResolutionMap | null;

  accentColor: string;
  secondaryColor: string;
  shadeColor: string;
  backgroundColor: string;
}

export interface BasicPromptReviewItem extends BasePromptReviewItem {
  prompt: BasicPrompt;
  promptParameters: BasicPromptParameters;
  promptState: PromptState | null;
}

export interface ApplicationPromptReviewItem extends BasePromptReviewItem {
  prompt: ApplicationPrompt;
  promptParameters: ApplicationPromptParameters;
  promptState: PromptState | null;
}

export interface ClozePromptReviewItem extends BasePromptReviewItem {
  prompt: ClozePrompt;
  promptParameters: ClozePromptParameters;
  promptState: PromptState | null;
}

export type PromptReviewItem =
  | BasicPromptReviewItem
  | ApplicationPromptReviewItem
  | ClozePromptReviewItem;

export type ReviewItem = PromptReviewItem;
