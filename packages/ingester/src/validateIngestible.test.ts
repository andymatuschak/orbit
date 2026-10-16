import { expect, it } from "bun:test";
import { createIngestibleValidator } from "./validateIngestible.js";

it("accepts valid schema", () => {
  const validator = createIngestibleValidator({
    mutateWithDefaultValues: true,
  });
  const { isValid, errors } = validator.validate({
    sources: [
      {
        identifier: "aaaaaaaaaaaaaaaaaaaaaa",
        title: "Brand new source",
        items: [
          {
            identifier: "identifier_item_A",
            spec: {
              type: "memory",
              content: {
                type: "qa",
                body: { text: "Question", attachments: [] },
                answer: { text: "Answer", attachments: [] },
              },
            },
          },
        ],
      },
    ],
  });
  expect(errors).toBeNull();
  expect(isValid).toBeTruthy();
});

it("rejects invalid schema", () => {
  const validator = createIngestibleValidator({
    mutateWithDefaultValues: true,
  });
  const { isValid, errors } = validator.validate({});
  expect(errors).toEqual([
    { message: "must have required property 'sources'", path: "" },
  ]);
  expect(isValid).toBeFalsy();
});

it("accepts optional authored task IDs and rejects malformed ones", () => {
  const validator = createIngestibleValidator({
    mutateWithDefaultValues: false,
  });
  const input = (taskID: unknown) => ({
    sources: [
      {
        identifier: "note",
        title: "Note",
        items: [
          {
            identifier: "item",
            taskID,
            spec: {
              type: "memory",
              content: {
                type: "qa",
                body: { text: "Question", attachments: [] },
                answer: { text: "Answer", attachments: [] },
              },
            },
          },
        ],
      },
    ],
  });
  expect(validator.validate(input("aB0123456789_-abcdefgh")).isValid).toBe(
    true,
  );
  for (const taskID of ["", "short", "x".repeat(23), "/".repeat(22), null, 123])
    expect(validator.validate(input(taskID)).isValid).toBe(false);
});
