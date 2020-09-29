import {
  ColorPaletteName,
  getIntervalSequenceForSchedule,
  PromptProvenanceType,
} from "metabook-core";
import { testQAPrompt } from "metabook-sample-data";
import { ReviewItem } from "../../reviewItem";

const intervalSequence = getIntervalSequenceForSchedule("default");

export function generateReviewItem(
  questionText: string,
  answerText: string,
  contextString: string,
  colorPaletteName: ColorPaletteName,
): ReviewItem {
  const intervalMillis =
    intervalSequence[Math.floor(Math.random() * (intervalSequence.length - 1))]
      .interval;
  return {
    reviewItemType: "prompt",
    promptState: {
      dueTimestampMillis: 0,
      headActionLogIDs: [],
      intervalMillis,
      bestIntervalMillis: null,
      lastReviewTaskParameters: null,
      lastReviewTimestampMillis: Date.now() - intervalMillis,
      needsRetry: false,
      taskMetadata: {
        isDeleted: false,
        provenance: {
          provenanceType: PromptProvenanceType.Web,
          externalID: "http://foo.com",
          modificationTimestampMillis: null,
          title: contextString,
          url: "http://foo.com",
          siteName: null,
          colorPaletteName,
        },
      },
    },
    prompt: {
      ...testQAPrompt,
      question: { contents: questionText, attachments: [] },
      answer: { contents: answerText, attachments: [] },
    },
    promptParameters: null,
    attachmentResolutionMap: null,
  };
}
