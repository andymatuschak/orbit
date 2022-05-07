import {
  ClozeTaskContent,
  PlainTaskContent,
  QATaskContent,
  TaskContent,
  TaskContentType,
  TaskSpec,
} from "@withorbit/core";
import crypto from "crypto";
import { Hasher } from "./hasher";

// normalize each of the objects into an array of strings to ensure
// that the hash is not sensitive to key ordering
const taskContentDeterministicOrder: {
  [key in TaskContentType]: (spec: TaskContent) => string[];
} = {
  [TaskContentType.QA]: (content) => {
    const qa = content as QATaskContent;
    return [content.type, qa.body.text, qa.answer.text];
  },
  [TaskContentType.Cloze]: (content) => {
    const cloze = content as ClozeTaskContent;
    return [content.type, cloze.body.text];
  },
  [TaskContentType.Plain]: (content) => {
    const plain = content as PlainTaskContent;
    return [content.type, plain.body.text];
  },
};

export const CryptoBase64Hasher: Hasher = {
  hash(spec: TaskSpec): string {
    let ordering = taskContentDeterministicOrder[spec.content.type](
      spec.content,
    );
    ordering = [spec.type, ...ordering];
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(ordering))
      .digest("base64");
  },
};
