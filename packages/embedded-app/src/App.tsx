import {
  getDefaultFirebaseApp,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import {
  getIDForPrompt,
  getIDForPromptTask,
  Prompt,
  PromptParameters,
  PromptTask,
  repetitionActionLogType,
} from "metabook-core";
import { testBasicPrompt } from "metabook-sample-data";
import { promptReviewItemType, ReviewArea, ReviewItem } from "metabook-ui";
import { ReviewAreaMarkingRecord } from "metabook-ui/dist/components/ReviewArea";
import React from "react";

declare global {
  // suppiled by Webpack
  const USER_ID: string | null;
}

interface EmbeddedItem {
  prompt: Prompt;
  promptParameters: PromptParameters;
}

const defaultItems: ReviewItem[] = [
  {
    reviewItemType: promptReviewItemType,
    attachmentResolutionMap: null,
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
  },
  {
    reviewItemType: promptReviewItemType,
    attachmentResolutionMap: null,
    prompt: testBasicPrompt,
    promptParameters: null,
    promptState: null,
  },
];

function App() {
  const [queue, setQueue] = React.useState<ReviewItem[]>(() => {
    // Try to deserialize PromptTasks from anchor.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.search);
      const tasksString = params.get("i");
      if (tasksString) {
        const items: EmbeddedItem[] = JSON.parse(tasksString);
        // TODO validate items
        return items.map(
          (item) =>
            ({
              prompt: item.prompt,
              promptParameters: item.promptParameters,
              promptState: null,
              reviewItemType: promptReviewItemType,
              attachmentResolutionMap: null,
            } as ReviewItem),
        );
      }
    }
    return defaultItems;
  });

  const [{ userClient, dataClient }] = React.useState(() => {
    console.log("User ID:", USER_ID);

    const app = getDefaultFirebaseApp();
    const firestore = app.firestore();
    return {
      userClient: new MetabookFirebaseUserClient(firestore, "demo"),
      dataClient: new MetabookFirebaseDataClient(firestore, app.functions()),
    };
  });

  const onMark = React.useCallback(
    (marking: ReviewAreaMarkingRecord) => {
      setQueue((queue) => queue.slice(1));

      if (!USER_ID) {
        return;
      }

      // Ingest prompt for user
      const promptTask = {
        promptType: marking.reviewItem.prompt.promptType,
        promptID: getIDForPrompt(marking.reviewItem.prompt),
        promptParameters: marking.reviewItem.promptParameters,
      } as PromptTask;

      userClient
        .recordActionLogs([
          {
            actionLogType: repetitionActionLogType,
            taskID: getIDForPromptTask(promptTask),
            parentActionLogIDs: [],
            taskParameters: null,
            outcome: marking.outcome,
            context: null,
            timestampMillis: Date.now(),
          },
        ])
        .then(() => console.log("Recorded log"))
        .catch((error) => console.error("Error recording log", error));

      dataClient
        .recordPrompts([marking.reviewItem.prompt])
        .then(() => console.log("Recorded prompt."))
        .catch((error) => console.error("Error recording prompt", error));
    },
    [userClient, dataClient],
  );

  return (
    <div className="App">
      <ReviewArea
        items={queue}
        onMark={onMark}
        schedule="default"
        shouldLabelApplicationPrompts={true}
      />
      {USER_ID ? null : (
        <div
          style={{
            position: "absolute",
            pointerEvents: "none",
            textAlign: "center",
            top: "10px",
            width: "100%",
            fontFamily: "system-ui, sans-serif",
            fontSize: 12,
            opacity: 0.5,
          }}
        >
          For prototyping purposes; user data not persisted.
        </div>
      )}
    </div>
  );
}

export default App;
