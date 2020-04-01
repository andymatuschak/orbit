// A *prompt spec* describes the data for one or more related prompts. A cloze prompt group is described by a spec which is used to generate many prompts (one for each deletion).

export interface QAPromptSpec {
  question: string;
  answer: string;
  explanation: string | null;
}

export const basicPromptSpecType = "basic";
export interface BasicPromptSpec extends QAPromptSpec {
  promptSpecType: typeof basicPromptSpecType;
}

export const applicationPromptSpecType = "applicationPrompt";
export interface ApplicationPromptSpec {
  promptSpecType: typeof applicationPromptSpecType;
  variants: QAPromptSpec[];
}

export const clozePromptGroupSpecType = "cloze";
export interface ClozePromptGroupSpec {
  promptSpecType: typeof clozePromptGroupSpecType;
  contents: string;
}

export type PromptSpec =
  | BasicPromptSpec
  | ApplicationPromptSpec
  | ClozePromptGroupSpec;
export type PromptSpecType = PromptSpec["promptSpecType"];

/*

given a task, to write a prompt's state:
* basic prompts: hash the data, write as usual
* cloze prompts: hash the contents, write to contentsHash/clozeIndex
* application propmts: hash the prompt data, write to contentsHash/variantIndex

given a log entry:
* separate the paths. read the first path segment.
* if it's a basic prompt, record the data as usual
    e.g. p111
* if it's a cloze prompt, record the data in the variant's card states
    e.g. p111/0
* if it's an application prompt, record the data in the parent, including the next prompt index
    e.g. p000/0

to make the task:
* separate the path components. look at the first segment.
* if it's a basic prompt, trivial
* if it's a cloze prompt, trivial
* if it's an application prompt, get appropriate child

 */
