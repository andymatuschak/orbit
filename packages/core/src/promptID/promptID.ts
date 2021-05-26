import {
  applicationPromptType,
  qaPromptType,
  clozePromptType,
  Prompt,
  PromptField,
  QAPromptContents,
} from "../types/prompt";
import CID from "multiformats/cid";
import {
  CIDEncodable,
  encodeObjectToCIDString,
  encodeObjectToCIDStringSync,
} from "../util/cids";

function canonicalizePromptField(
  promptField: PromptField,
): CIDEncodable<PromptField> {
  return {
    contents: promptField.contents,
    attachments: promptField.attachments.map((ref) => ({
      type: ref.type,
      id: CID.parse(ref.id),
      byteLength: ref.byteLength,
    })),
  };
}

function canonicalizeQAPrompt(
  prompt: QAPromptContents,
): CIDEncodable<QAPromptContents> {
  return {
    question: canonicalizePromptField(prompt.question),
    answer: canonicalizePromptField(prompt.answer),
    explanation: prompt.explanation
      ? canonicalizePromptField(prompt.explanation)
      : undefined,
  };
}

function canonicalizePrompt(prompt: Prompt): CIDEncodable<Prompt> {
  switch (prompt.promptType) {
    case qaPromptType:
      return {
        promptType: prompt.promptType,
        ...canonicalizeQAPrompt(prompt),
      };
    case applicationPromptType:
      return {
        promptType: prompt.promptType,
        variants: prompt.variants.map((v) => canonicalizeQAPrompt(v)),
      };
    case clozePromptType:
      return {
        promptType: prompt.promptType,
        body: canonicalizePromptField(prompt.body),
      };
  }
}

/**
 * @TJS-type string
 */
export type PromptID = string & { __promptIDOpaqueType: never };

export async function getIDForPrompt(prompt: Prompt): Promise<PromptID> {
  return (await encodeObjectToCIDString(
    canonicalizePrompt(prompt),
  )) as PromptID;
}

export function getIDForPromptSync(prompt: Prompt): PromptID {
  return encodeObjectToCIDStringSync(canonicalizePrompt(prompt)) as PromptID;
}
