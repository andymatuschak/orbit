import {
  ClozeTaskContent,
  PlainTaskContent,
  QATaskContent,
  TaskContent,
  TaskContentType,
  TaskSpec,
} from "@withorbit/core";
import crypto from "crypto";
import { Hasher } from "./hasher.js";

// normalize each of the objects into an array of strings to ensure
// that the hash is not sensitive to key ordering
const taskContentDeterministicOrder: {
  [key in TaskContentType]: (spec: TaskContent) => (string | number | null)[];
} = {
  [TaskContentType.QA]: (content) => {
    const qa = content as QATaskContent;
    return [content.type, qa.body.text, qa.answer.text];
  },
  [TaskContentType.Cloze]: (content) => {
    const cloze = content as ClozeTaskContent;
    let output: (string | number | null)[] = [content.type, cloze.body.text];
    for (const [id, component] of Object.entries(cloze.components)) {
      output = output.concat(
        id,
        component.order,
        ...component.ranges.flatMap((r) => [r.hint, r.startIndex, r.length]),
      );
    }
    return output;
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
