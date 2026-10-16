import { TaskContentType, type TaskSpec } from "@withorbit/core";
import { createHash } from "node:crypto";

/** Preserve the historical import identifiers, independently of object field order. */
export function hashTaskSpec(spec: TaskSpec): string {
  const { content } = spec;
  const values: (string | number | null)[] = [spec.type, content.type];
  switch (content.type) {
    case TaskContentType.QA:
      values.push(content.body.text, content.answer.text);
      break;
    case TaskContentType.Plain:
      values.push(content.body.text);
      break;
    case TaskContentType.Cloze:
      values.push(content.body.text);
      // Component and range iteration order is part of the existing identity format.
      for (const [id, component] of Object.entries(content.components)) {
        values.push(id, component.order);
        for (const range of component.ranges) {
          values.push(range.hint, range.startIndex, range.length);
        }
      }
      break;
  }
  return createHash("sha256").update(JSON.stringify(values)).digest("base64");
}
