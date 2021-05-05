import {
  findAllPrompts,
  ClozePrompt,
  clozePromptType,
  processor,
} from "incremental-thinking";
import {
  createAnkiTextFromClozePrompt,
  decodeAnkiPathFieldToTaskIDPath,
  encodeTaskIDPathToAnkiPathField,
} from "./ankiTextEncoding";

describe("anki text encoding", () => {
  const prompt = findAllPrompts(
    processor.parse(
      "This *is* a __test__ of {cloze} stripping with {two} cloze deletions.",
    ),
  )[0] as ClozePrompt;
  expect(prompt.type).toEqual(clozePromptType);

  const text = createAnkiTextFromClozePrompt(prompt);

  test("keeps Markdown", () => {
    expect(text).toEqual(
      "This is a test of {{c1::cloze}} stripping with {{c2::two}} cloze deletions.",
    );
  });

  test("doesn't keep stray cloze numbers", () => {
    expect(text).toEqual(createAnkiTextFromClozePrompt(prompt));
  });
});

describe("anki path field", () => {
  test("encodes paths to base64, no slashes", () => {
    const encodedPath = encodeTaskIDPathToAnkiPathField(["/foo.md"]);
    expect(/\//.test(encodedPath)).toBeFalsy();
    expect(encodedPath).toMatchInlineSnapshot(`"XC9mb28ubWQ="`);
  });

  test("round trips paths", () => {
    const testPath = ["/foo.md", "aslkdfjklasdfj", "3"];
    expect(
      decodeAnkiPathFieldToTaskIDPath(
        encodeTaskIDPathToAnkiPathField(testPath),
      ),
    ).toEqual(testPath);
  });
});
