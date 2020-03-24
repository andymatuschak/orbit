import {Card, ReviewArea} from 'metabook-ui';
import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import * as Font from 'expo-font';

const testBasicCardData: any = {
  cardType: 'basic',
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
  const [isFontReady, setFontReady] = useState(false);

  useEffect(() => {
    Font.loadAsync({
      'Libre Franklin': require('./assets/fonts/LibreFranklin-Regular.ttf'),
    }).then(() => {
      setFontReady(true);
    });
  }, []);
  const initialTasks: any[] = Array.from(new Array(5).keys()).map(i =>
    generateTask(`Question ${i + 1}`),
  );

  const [tasks, setTasks] = useState(initialTasks);

  const onMark = useCallback(markingRecord => {
    setTasks(tasks => tasks.slice(1));
  }, []);

  return (
    <View style={styles.container}>
      {isFontReady ? (
        <ReviewArea
          tasks={tasks}
          onMark={onMark}
          schedule="aggressiveStart"
          shouldLabelApplicationPrompts={false}
          onLogin={() => {
            return;
          }}
        />
      ) : (
        <Text>Loading</Text>
      )}
    </View>
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
