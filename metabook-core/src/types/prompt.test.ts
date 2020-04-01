import { PromptSpecID } from "../promptSpecID";
import { decodePrompt, PromptID, encodePrompt } from "./prompt";

describe("decoding prompt IDs", () => {
  test("decoding basic prompt IDs", () => {
    expect(decodePrompt("foo" as PromptID)).toMatchObject({
      promptSpecID: "foo",
    });
  });

  test("decoding cloze prompt IDs", () => {
    expect(decodePrompt("foo/3" as PromptID)).toMatchObject({
      promptSpecID: "foo",
      promptParameters: {
        clozeIndex: 3,
      },
    });
  });

  test("decoding invalid indexed prompt IDs", () => {
    expect(decodePrompt("foo/bar" as PromptID)).toBeNull();
  });

  test("decoding prompt IDs with too many segments", () => {
    expect(decodePrompt("foo/3/4" as PromptID)).toBeNull();
  });
});

describe("encoding prompt IDs", () => {
  test("encoding basic prompt IDs", () => {
    expect(
      encodePrompt({
        promptSpecID: "foo" as PromptSpecID,
        promptParameters: null,
      }),
    ).toEqual("foo");
  });

  test("encoding cloze prompt IDs", () => {
    expect(
      encodePrompt({
        promptSpecID: "foo" as PromptSpecID,
        promptParameters: { clozeIndex: 3 },
      }),
    ).toEqual("foo/3");
  });
});
