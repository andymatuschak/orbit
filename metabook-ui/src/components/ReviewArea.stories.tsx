import { testBasicPromptSpec } from "metabook-sample-data";
import React, { useCallback, useState } from "react";
import ReviewArea, { ReviewTask } from "./ReviewArea";

// noinspection JSUnusedGlobalSymbols
export default {
  title: "ReviewArea",
  component: ReviewArea,
};

function generateTask(questionText: string): ReviewTask {
  return {
    type: "prompt",
    promptState: null,
    promptTask: {
      spec: { ...testBasicPromptSpec, question: questionText },
    },
  };
}

export function Basic() {
  const initialTasks: ReviewTask[] = Array.from(new Array(5).keys()).map((i) =>
    generateTask(`Question ${i + 1}`),
  );

  const [tasks, setTasks] = useState(initialTasks);

  const onMark = useCallback(() => {
    setTasks((tasks) => tasks.slice(1));
  }, []);

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
