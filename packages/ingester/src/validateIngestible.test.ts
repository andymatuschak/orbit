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
            url: "https://example.com/source#prompt",
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

it("rejects non-string item URLs", () => {
  const { isValid, errors } = createIngestibleValidator({
    mutateWithDefaultValues: false,
  }).validate({
    sources: [
      {
        identifier: "source",
        title: "Source",
        items: [
          {
            identifier: "item",
            url: {},
            spec: {
              type: "memory",
              content: {
                type: "plain",
                body: { text: "Prompt", attachments: [] },
              },
            },
          },
        ],
      },
    ],
  });
  expect(isValid).toBe(false);
  expect(errors).toContainEqual({
    path: "/sources/0/items/0/url",
    message: "must be string",
  });
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
