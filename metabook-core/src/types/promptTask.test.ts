import { PromptID } from "../promptID";
import { decodePromptTask, PromptTaskID, encodePromptTask } from "./promptTask";

describe("decoding prompt task IDs", () => {
  test("decoding basic prompt task IDs", () => {
    expect(decodePromptTask("foo" as PromptTaskID)).toMatchObject({
      promptID: "foo",
    });
  });

  test("decoding cloze prompt task IDs", () => {
    expect(decodePromptTask("foo/3" as PromptTaskID)).toMatchObject({
      promptID: "foo",
      promptParameters: {
        clozeIndex: 3,
      },
    });
  });

  test("decoding invalid indexed prompt task IDs", () => {
    expect(decodePromptTask("foo/bar" as PromptTaskID)).toBeNull();
  });

  test("decoding prompt IDs with too many segments", () => {
    expect(decodePromptTask("foo/3/4" as PromptTaskID)).toBeNull();
  });
});

describe("encoding prompt task IDs", () => {
  test("encoding basic prompt task IDs", () => {
    expect(
      encodePromptTask({
        promptID: "foo" as PromptID,
        promptParameters: null,
      }),
    ).toEqual("foo");
  });

  test("encoding cloze prompt task IDs", () => {
    expect(
      encodePromptTask({
        promptID: "foo" as PromptID,
        promptParameters: { clozeIndex: 3 },
      }),
    ).toEqual("foo/3");
  });
});
