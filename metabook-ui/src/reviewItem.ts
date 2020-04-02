import {
  ApplicationPromptParameters,
  ApplicationPromptSpec,
  ApplicationPromptState,
  AttachmentID,
  AttachmentURLReference,
  BasicPromptParameters,
  BasicPromptSpec,
  BasicPromptState,
  ClozePromptGroupSpec,
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
  promptSpec: BasicPromptSpec;
  promptParameters: BasicPromptParameters;
  promptState: BasicPromptState | null;
}

export interface ApplicationPromptReviewItem extends BasePromptReviewItem {
  promptSpec: ApplicationPromptSpec;
  promptParameters: ApplicationPromptParameters;
  promptState: ApplicationPromptState | null;
}

export interface ClozePromptReviewItem extends BasePromptReviewItem {
  promptSpec: ClozePromptGroupSpec;
  promptParameters: ClozePromptParameters;
  promptState: ClozePromptState | null;
}

export type PromptReviewItem =
  | BasicPromptReviewItem
  | ApplicationPromptReviewItem
  | ClozePromptReviewItem;

export type ReviewItem = PromptReviewItem /* | LoginReviewTask TODO */;
