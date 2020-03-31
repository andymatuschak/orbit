import firebase from "firebase";
import {
  MetabookFirebaseDataClient,
  MetabookFirebaseUserClient,
} from "metabook-client";
import { getIDForPromptData } from "metabook-core/dist/identifiers";
import { testBasicPromptData } from "metabook-sample-data";
import { ReviewAreaProps, ReviewTask } from "metabook-ui";
import { ReviewArea } from "metabook-ui-web";
import React, { useCallback, useState } from "react";

function generateTask(questionText: string): ReviewTask {
  return {
    type: "question",
    cardState: null,
    promptData: { ...testBasicPromptData, question: questionText },
    promptIndex: null,
  };
}

function App() {
  const initialTasks: ReviewTask[] = Array.from(new Array(5).keys()).map((i) =>
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
      .recordData(initialTasks.map((t) => t.promptData))
      .then((r) => console.log("Finished recording prompts", r))
      .catch((error) => console.error("Couldn't record prompts", error));

    return new MetabookFirebaseUserClient(app, "testID");
  });

  const [tasks, setTasks] = useState(initialTasks);

  const onMark = useCallback<ReviewAreaProps["onMark"]>(
    async (marking) => {
      setTasks((tasks) => tasks.slice(1));

      const promptID = getIDForPromptData(marking.task.promptData);
      const { newCardState, commit } = client.recordCardStateUpdate({
        actionOutcome: marking.outcome,
        baseCardState: null,
        promptID,
        promptType: marking.task.promptData.promptType,
        sessionID: null,
        timestamp: Date.now(),
      });

      await commit;
      console.log("Committed", promptID);
    },
    [client],
  );

  return (
    <ReviewArea
      tasks={tasks}
      onMark={onMark}
      schedule="aggressiveStart"
      shouldLabelApplicationPrompts={false}
      onLogin={() => {
        return;
      }}
    />
  );
}

export default App;
