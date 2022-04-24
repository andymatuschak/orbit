import { createIngestibleValidator } from "./validateIngestible";

it("accepts valid schema", () => {
  const validator = createIngestibleValidator({
    mutateWithDefaultValues: true,
  });
  const { isValid, errors } = validator.validate({
    sources: [
      {
        identifier: "aaaaaaaaaaaaaaaaaaaaaa",
        title: "Brand new source",
        prompts: [
          {
            type: "qa",
            body: { text: "Question" },
            answer: { text: "Answer" },
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
