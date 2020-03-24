export interface QuestionAnswerData {
  question: string;
  answer: string;
  explanation: string | null;
}

export interface BasicPromptData extends QuestionAnswerData {
  cardType: "basic";
}

export interface ApplicationPromptData {
  cardType: "applicationPrompt";
  prompts: QuestionAnswerData[];
}

export type PromptData = BasicPromptData | ApplicationPromptData;
export type PromptType = "basic" | "applicationPrompt";
