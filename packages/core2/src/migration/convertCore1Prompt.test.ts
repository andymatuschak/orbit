import {
  ClozePrompt,
  clozePromptType,
  QAPrompt,
  qaPromptType,
} from "@withorbit/core";
import { ClozeTaskContent, TaskContentType, TaskSpec } from "../entities/task";
import { convertCore1Prompt } from "./convertCore1Prompt";

const testQAPrompt: QAPrompt = {
  promptType: qaPromptType,
  question: {
    contents:
      "Is it possible to use _quantum teleportation_ to transmit information faster than light?\n\nThis is a **second paragraph** with _**bold italic**_.",
    attachments: [],
  },
  answer: {
    contents: "No.",
    attachments: [],
  },
};

const testClozePrompt: ClozePrompt = {
  promptType: clozePromptType,
  body: {
    contents:
      "The *Big Five* personality traits: {extraversion}, {openness to experience}, {neuroticism}, {conscientiousness}, {agreeableness}.",
    attachments: [],
  },
};

test("qa prompt", () => {
  const converted = convertCore1Prompt(testQAPrompt);
  expect(converted).toMatchInlineSnapshot(`
    Object {
      "content": Object {
        "answer": Object {
          "attachments": Array [],
          "text": "No.",
        },
        "body": Object {
          "attachments": Array [],
          "text": "Is it possible to use _quantum teleportation_ to transmit information faster than light?

    This is a **second paragraph** with _**bold italic**_.",
        },
        "type": "qa",
      },
      "type": "memory",
    }
  `);
});

test("cloze prompt", () => {
  const converted = convertCore1Prompt(
    testClozePrompt,
  ) as TaskSpec<ClozeTaskContent>;
  expect(converted.content.type).toEqual(TaskContentType.Cloze);
  expect(converted.content.body.text).toEqual(
    "The *Big Five* personality traits: extraversion, openness to experience, neuroticism, conscientiousness, agreeableness.",
  );
  const componentKeys = Object.keys(converted.content.components);
  componentKeys.sort();
  expect(componentKeys.length).toEqual(5);
  expect(
    componentKeys.map((key) => {
      const component = converted.content.components[key];
      if (component.ranges.length !== 1) {
        throw new Error("Should be exactly one component range");
      }
      return converted.content.body.text.substr(
        component.ranges[0].startIndex,
        component.ranges[0].length,
      );
    }),
  ).toEqual([
    "extraversion",
    "openness to experience",
    "neuroticism",
    "conscientiousness",
    "agreeableness",
  ]);
});
