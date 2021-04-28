import { PromptID } from "../promptID";
import { qaPromptType, clozePromptType } from "./prompt";
import {
  getIDForPromptTask,
  getPromptTaskForID,
  PromptTaskID,
} from "./promptTask";

describe("decoding prompt task IDs", () => {
  test("decoding qa prompt task IDs", () => {
    expect(
      getPromptTaskForID(`${qaPromptType}/foo` as PromptTaskID),
    ).toMatchObject({
      promptID: "foo",
      promptType: qaPromptType,
    });
  });

  test("decoding cloze prompt task IDs", () => {
    expect(
      getPromptTaskForID(`${clozePromptType}/foo/3` as PromptTaskID),
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
        promptType: qaPromptType,
        promptParameters: null,
      }),
    ).toEqual(`${qaPromptType}/foo`);
  });

  test("encoding cloze prompt task IDs", () => {
    expect(
      getIDForPromptTask({
        promptID: "foo" as PromptID,
        promptType: clozePromptType,
        promptParameters: { clozeIndex: 3 },
      }),
    ).toEqual(`${clozePromptType}/foo/3`);
  });
});
