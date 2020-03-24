import "node-libs-react-native/globals";
import "./shimBase64";

import firebase from "firebase";
import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import { getIDForPromptData } from "metabook-core";
import { testBasicPromptData } from "metabook-sample-data";
import { ReviewArea, ReviewAreaProps, ReviewTask } from "metabook-ui";
import colors from "metabook-ui/dist/styles/colors";
import "node-libs-react-native/globals";
import React, { useCallback, useState } from "react";
import { StyleSheet, View } from "react-native";

function generateTask(questionText: string): ReviewTask {
  return {
    type: "question",
    cardState: null,
    promptData: { ...testBasicPromptData, question: questionText },
    promptIndex: null,
  };
}

export default function App() {
  const initialTasks: ReviewTask[] = Array.from(new Array(5).keys()).map(i =>
    generateTask(`Question ${i + 1}`),
  );

  const [client] = useState(() => {
    const app = firebase.initializeApp({
      apiKey: "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c",
      authDomain: "metabook-system.firebaseapp.com",
      databaseURL: "https://metabook-system.firebaseio.com",
      projectId: "metabook-system",
      storageBucket: "metabook-system.appspot.com",
      messagingSenderId: "748053153064",
      appId: "1:748053153064:web:efc2dfbc9ac11d8512bc1d",
    });

    const dataClient = new MetabookFirebaseDataClient(app);
    dataClient
      .recordData(initialTasks.map(t => t.promptData))
      .then(r => console.log("finished recording prompts", r))
      .catch(error => console.error("Couldn't record prompts", error));

    const userClient = new MetabookFirebaseUserClient(app, "testID");
    userClient.getCardStates({}).then(r => console.log("states", r));

    return userClient;
  });

  const [tasks, setTasks] = useState(initialTasks);

  const onMark = useCallback<ReviewAreaProps["onMark"]>(
    async marking => {
      setTasks(tasks => tasks.slice(1));

      const promptID = getIDForPromptData(marking.task.promptData);
      const { newCardState, commit } = client.recordCardStateUpdate({
        actionOutcome: marking.outcome,
        baseCardState: null,
        promptID,
        promptType: marking.task.promptData.cardType,
        sessionID: null,
        timestamp: Date.now(),
      });

      console.log("New state", newCardState);
      await commit;
      console.log("Committed", promptID);
    },
    [client],
  );

  return (
    <View
      style={{
        flexGrow: 1,
        justifyContent: "center",
        backgroundColor: colors.key00,
      }}
    >
      <ReviewArea
        tasks={tasks}
        onMark={onMark}
        schedule="aggressiveStart"
        shouldLabelApplicationPrompts={false}
        onLogin={() => {
          return;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0",
    alignItems: "center",
    justifyContent: "center",
  },
});
