import {
  getIDForPrompt,
  getIDForPromptTask,
  getNextTaskParameters,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import { ReviewArea, ReviewAreaProps, ReviewItem } from "metabook-ui";
import { ReviewAreaMarkingRecord } from "metabook-ui/dist/components/ReviewArea";
import colors from "metabook-ui/dist/styles/colors";
import { spacing } from "metabook-ui/dist/styles/layout";
import typography from "metabook-ui/dist/styles/typography";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, SafeAreaView, Text, View } from "react-native";
import DatabaseManager from "./model/databaseManager";
import PromptStateClient from "./model/promptStateClient";
import ReviewSessionProgressBar from "./ReviewSessionProgressBar";

function onMark(
  promptStateClient: PromptStateClient | null,
  marking: ReviewAreaMarkingRecord,
) {
  console.log("[Performance] Mark prompt", Date.now() / 1000.0);

  promptStateClient!
    .recordPromptActionLogs([
      {
        log: {
          actionLogType: repetitionActionLogType,
          parentActionLogIDs:
            marking.reviewItem.promptState?.headActionLogIDs ?? [],
          taskID: getIDForPromptTask({
            promptID: getIDForPrompt(marking.reviewItem.prompt),
            promptType: marking.reviewItem.prompt.promptType,
            promptParameters: marking.reviewItem.promptParameters,
          } as PromptTask),
          outcome: marking.outcome,
          context: null,
          timestampMillis: Date.now(),
          taskParameters: getNextTaskParameters(
            marking.reviewItem.prompt,
            marking.reviewItem.promptState?.lastReviewTaskParameters ?? null,
          ),
        },
      },
    ])
    .then(() => {
      console.log("[Performance] Log committed to server", Date.now() / 1000.0);
    })
    .catch((error) => {
      console.error("Couldn't commit", marking.reviewItem.prompt, error);
    });
}

interface ReviewSessionProps {
  databaseManager: DatabaseManager;
}

export default function ReviewSession({ databaseManager }: ReviewSessionProps) {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [currentQueueIndex, setCurrentQueueIndex] = useState(0);
  useEffect(() => {
    let isCanceled = false;
    databaseManager.fetchReviewQueue().then((items) => {
      if (isCanceled) return;
      setItems(items);
    });
    return () => {
      isCanceled = true;
    };
  }, [databaseManager]);

  const remainingItems = useMemo(() => items?.slice(currentQueueIndex), [
    items,
    currentQueueIndex,
  ]);

  const onMarkCallback = useCallback<ReviewAreaProps["onMark"]>((marking) => {
    // onMark(promptStateClient, marking);
    setCurrentQueueIndex((currentQueueIndex) => currentQueueIndex + 1);
  }, []);

  console.log("[Performance] Render", Date.now() / 1000.0);

  const outerViewComponent =
    Platform.OS === "ios" && Platform.isPad ? View : SafeAreaView; // TODO: Catalyst hack
  return React.createElement(
    outerViewComponent,
    {
      style: {
        flex: 1,
        justifyContent: "center",
        backgroundColor: colors.key00,
      },
    },
    remainingItems ? (
      remainingItems.length > 0 ? (
        <View style={{ flex: 1, alignItems: "center" }}>
          <ReviewArea
            items={remainingItems}
            onMark={onMarkCallback}
            schedule="aggressiveStart"
            shouldLabelApplicationPrompts={false}
          />
          <ReviewSessionProgressBar
            completedTaskCount={currentQueueIndex}
            totalTaskCount={items!.length}
          />
        </View>
      ) : (
        <Text
          style={{
            textAlign: "center",
            ...typography.cardBodyText,
            color: colors.key70,
            opacity: 0.4,
            fontSize: 24,
            lineHeight: 24 * 1.5,
            marginLeft: spacing.spacing05,
            marginRight: spacing.spacing05,
          }}
        >{`All caught up!\nNothing's due for review.`}</Text>
      )
    ) : null,
  );
}
