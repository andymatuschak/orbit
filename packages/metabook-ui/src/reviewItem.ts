import {
  AbstractPromptTask,
  ApplicationPromptTask,
  AttachmentID,
  AttachmentURLReference,
  ClozePromptTask,
  PromptProvenanceType,
  PromptState,
  PromptTask,
  QAPromptTask,
} from "metabook-core";
import { colors } from "./styles";

export const promptReviewItemType = "prompt";
export type AttachmentResolutionMap = Map<AttachmentID, AttachmentURLReference>;

export interface PromptReviewItem<PT extends PromptTask = PromptTask> {
  reviewItemType: typeof promptReviewItemType;
  attachmentResolutionMap: AttachmentResolutionMap | null;
  prompt: PT extends AbstractPromptTask<infer P, any> ? P : never;
  promptParameters: PT["promptParameters"];
  promptState: PromptState | null;
}

export type QAPromptReviewItem = PromptReviewItem<QAPromptTask>;
export type ClozePromptReviewItem = PromptReviewItem<ClozePromptTask>;
export type ApplicationPromptReviewItem = PromptReviewItem<
  ApplicationPromptTask
>;

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
