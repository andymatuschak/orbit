import {
  ApplicationPrompt,
  ApplicationPromptParameters,
  AttachmentID,
  AttachmentURLReference,
  ClozePrompt,
  ClozePromptParameters,
  PromptProvenanceType,
  PromptState,
  QAPrompt,
  QAPromptParameters,
} from "metabook-core";
import { colors } from "./styles";

export const promptReviewItemType = "prompt";
export type AttachmentResolutionMap = Map<AttachmentID, AttachmentURLReference>;

interface BasePromptReviewItem {
  reviewItemType: typeof promptReviewItemType;
  attachmentResolutionMap: AttachmentResolutionMap | null;
}

export interface QAPromptReviewItem extends BasePromptReviewItem {
  prompt: QAPrompt;
  promptParameters: QAPromptParameters;
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
  | QAPromptReviewItem
  | ApplicationPromptReviewItem
  | ClozePromptReviewItem;

export type ReviewItem = PromptReviewItem;

export function getColorPaletteForReviewItem(
  reviewItem: ReviewItem,
): colors.ColorPalette {
  if (reviewItem.promptState) {
    const provenance = reviewItem.promptState.taskMetadata.provenance;
    if (
      provenance &&
      provenance.provenanceType === PromptProvenanceType.Web &&
      provenance.colorPaletteName &&
      colors.palettes[provenance.colorPaletteName]
    ) {
      return colors.palettes[provenance.colorPaletteName];
    }
  }

  const colorNames = colors.orderedPaletteNames;
  const colorName =
    colorNames[
      (reviewItem.promptState?.lastReviewTimestampMillis ?? 0) %
        colorNames.length
    ];
  return colors.palettes[colorName];
}
