import {ReviewArea, ReviewAreaProps, ReviewTask} from 'metabook-ui';
import React, {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';

const testBasicCardData: any = {
  promptType: 'basic',
  cardID: 'xxx',
  question:
    'Is it possible to use quantum teleportation to transmit information faster than light?\n\nThis is a second paragraph.',
  answer: 'No.',
  questionAdjustments: null,
  answerAdjustments: null,
  explanation: null,
};

function generateTask(questionText: string) {
  return {
    type: 'question',
    cardState: null,
    cardData: {...testBasicCardData, question: questionText},
    promptIndex: null,
  };
}

export default function App() {
  fojlaksdf;
  const initialTasks: ReviewTask[] = Array.from(new Array(5).keys()).map((i) =>
    generateTask(`Question ${i + 1}`),
  );

  // const [client] = useState(() => {
  //   const app = firebase.initializeApp({
  //     apiKey: "AIzaSyAwlVFBlx4D3s3eSrwOvUyqOKr_DXFmj0c",
  //     authDomain: "metabook-system.firebaseapp.com",
  //     databaseURL: "https://metabook-system.firebaseio.com",
  //     projectId: "metabook-system",
  //     storageBucket: "metabook-system.appspot.com",
  //     messagingSenderId: "748053153064",
  //     appId: "1:748053153064:web:efc2dfbc9ac11d8512bc1d",
  //   });
  //
  //   const dataClient = new MetabookFirebaseDataClient(app);
  //   dataClient
  //     .recordData(initialTasks.map(t => t.promptData))
  //     .then(r => console.log("finished recording prompts", r))
  //     .catch(error => console.error("Couldn't record prompts", error));
  //
  //   return new MetabookFirebaseUserClient(app, "testID");
  // });

  const [tasks, setTasks] = useState(initialTasks);

  const onMark = useCallback<ReviewAreaProps['onMark']>(
    async (marking) => {
      setTasks((tasks) => tasks.slice(1));

      // const promptID = getIDForPromptData(marking.task.promptData);
      // const { newCardState, commit } = client.recordCardStateUpdate({
      //   actionOutcome: marking.outcome,
      //   baseCardState: null,
      //   promptID,
      //   promptType: marking.task.promptData.promptType,
      //   sessionID: null,
      //   timestamp: Date.now(),
      // });
      //
      // console.log("New state", newCardState);
      // await commit;
      // console.log("Committed", promptID);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FCFAFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
