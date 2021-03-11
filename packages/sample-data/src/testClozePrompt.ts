import { ClozePrompt, clozePromptType } from "@withorbit/core";

const testClozePrompt: ClozePrompt = {
  promptType: clozePromptType,
  body: {
    contents:
      "The *Big Five* personality traits: {extraversion}, {openness to experience}, {neuroticism}, {conscientiousness}, {agreeableness}.",
    attachments: [],
  },
};

export default testClozePrompt;
