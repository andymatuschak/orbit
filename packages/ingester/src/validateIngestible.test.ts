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
