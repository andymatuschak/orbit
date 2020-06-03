import {
  getDefaultFirebaseApp,
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
  Authentication,
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
import {
  promptReviewItemType,
  ReviewArea,
  ReviewAreaMarkingRecord,
  ReviewItem,
} from "metabook-ui";
import BigButton from "metabook-ui/dist/components/BigButton";
import colors from "metabook-ui/dist/styles/colors";
import { spacing } from "metabook-ui/dist/styles/layout";
import typography from "metabook-ui/dist/styles/typography";

import React from "react";
import { View, Text, Button } from "react-native";

declare global {
  // supplied by Webpack
  const USER_ID: string | null;

  interface Document {
    requestStorageAccess(): Promise<undefined>;
    hasStorageAccess(): Promise<boolean>;
  }
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

function AuthenticationStatusIndicator(props: {
  userRecord: Authentication.UserRecord | null;
}) {
  const signIn = React.useCallback(() => {
    window.open("/login", "Sign in", "width=985,height=735");
  }, []);

  let interior: React.ReactNode;
  if (props.userRecord) {
    interior = (
      <Text
        style={{ ...typography.label, color: colors.textColor, opacity: 0.4 }}
      >{`Signed in as ${
        props.userRecord.displayName ??
        props.userRecord.emailAddress ??
        props.userRecord.userID
      }`}</Text>
    );
  } else {
    interior = (
      <BigButton title="Sign in" onPress={signIn} variant="secondary" />
    );
  }

  return (
    <View
      style={{
        position: "absolute",
        left: spacing.spacing07,
        bottom: spacing.spacing07,
      }}
    >
      {interior}
    </View>
  );
}

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

  const [{ userClient, dataClient, authenticationClient }] = React.useState(
    () => {
      console.log("User ID:", USER_ID);

      document.hasStorageAccess().then((hasStorageAccess) => {
        console.log("HAS STORAGE ACCESS", hasStorageAccess);
      });

      const app = getDefaultFirebaseApp();
      const firestore = app.firestore();
      return {
        userClient: new MetabookFirebaseUserClient(firestore, "demo"),
        dataClient: new MetabookFirebaseDataClient(firestore, app.functions()),
        authenticationClient: new Authentication.FirebaseAuthenticationClient(
          app.auth(),
        ),
      };
    },
  );

  const [
    userRecord,
    setUserRecord,
  ] = React.useState<Authentication.UserRecord | null>(null);
  React.useEffect(() => {
    if (authenticationClient) {
      authenticationClient.subscribeToUserAuthState((userRecord) => {
        console.log("Got user record:", userRecord);
        setUserRecord(userRecord);
      });
    }
  }, [authenticationClient]);

  const onMark = React.useCallback(
    (marking: ReviewAreaMarkingRecord) => {
      // document
      //   .requestStorageAccess()
      //   .then(() => {
      //     console.log("RECEIVED STORAGE ACCESS");
      //   })
      //   .catch(() => {
      //     console.error("NO STORAGE ACCESS");
      //   });
      document.hasStorageAccess().then((hasStorageAccess) => {
        console.log("HAS STORAGE ACCESS", hasStorageAccess);
      });

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
    <View style={{ position: "relative" }}>
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
      <AuthenticationStatusIndicator userRecord={userRecord} />
    </View>
  );
}

export default App;
