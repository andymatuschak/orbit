import { PromptID } from "../promptID";
import {
  applicationPromptType,
  basicPromptType,
  clozePromptType,
} from "./prompt";
import {
  getIDForPromptTask,
  getPromptTaskForID,
  PromptTaskID,
} from "./promptTask";

describe("decoding prompt task IDs", () => {
  test("decoding basic prompt task IDs", () => {
    expect(
      getPromptTaskForID(`foo/${basicPromptType}` as PromptTaskID),
    ).toMatchObject({
      promptID: "foo",
      promptType: basicPromptType,
    });
  });

  test("decoding cloze prompt task IDs", () => {
    expect(
      getPromptTaskForID(`foo/${clozePromptType}/3` as PromptTaskID),
    ).toMatchObject({
      promptID: "foo",
      promptType: clozePromptType,
      promptParameters: {
        clozeIndex: 3,
      },
    });
  });

  test("decoding invalid indexed prompt task IDs", () => {
    expect(getPromptTaskForID("foo/bar" as PromptTaskID)).toBeInstanceOf(Error);
  });

  test("decoding prompt IDs with with unknown types", () => {
    expect(getPromptTaskForID("foo/3/4" as PromptTaskID)).toBeInstanceOf(Error);
  });
});

describe("encoding prompt task IDs", () => {
  test("encoding basic prompt task IDs", () => {
    expect(
      getIDForPromptTask({
        promptID: "foo" as PromptID,
        promptType: basicPromptType,
        promptParameters: null,
      }),
    ).toEqual(`foo/${basicPromptType}`);
  });

  test("encoding cloze prompt task IDs", () => {
    expect(
      getIDForPromptTask({
        promptID: "foo" as PromptID,
        promptType: clozePromptType,
        promptParameters: { clozeIndex: 3 },
      }),
    ).toEqual(`foo/${clozePromptType}/3`);
  });
});
