import { ActionLogID, AttachmentID, PromptID } from "@withorbit/core";
import {
  getActionLogIDForFirebaseKey,
  getAttachmentIDForFirebaseKey,
  getFirebaseKeyForCIDString,
  getFirebaseKeyForTaskID,
  getPromptIDForFirebaseKey,
} from "./firebaseKeyEncoding";

describe("prompt ID", () => {
  const testPromptID =
    "z4EBG9j66Sram66kgDzn5rx2fg1UvWfYvNiSn8or7CD7LLccaaj" as PromptID;
  const firebaseKey = getFirebaseKeyForCIDString(testPromptID);
  test("stability", () => {
    expect(firebaseKey).toMatchInlineSnapshot(
      `"6ygZycowo6uzpHAXixNdRQ1UZHrNPVajDQCY4okFyM27"`,
    );
  });
  test("round trip", () => {
    expect(getPromptIDForFirebaseKey(firebaseKey)).toEqual(testPromptID);
  });
});

describe("attachment ID", () => {
  const testAttachmentID =
    "zb2rhXaeJ922fgKU1sHug4EhfEUQdA3oFRUV6CumZuUoZhgf3" as AttachmentID;
  const firebaseKey = getFirebaseKeyForCIDString(testAttachmentID);
  test("stability", () => {
    expect(firebaseKey).toMatchInlineSnapshot(
      `"wN6yfoJeK3CR6WQFkJHBqvMw5EAT61dLXT3KjdyXpPK"`,
    );
  });
  test("round trip", () => {
    expect(getAttachmentIDForFirebaseKey(firebaseKey)).toEqual(
      testAttachmentID,
    );
  });
});

describe("action log ID", () => {
  const testActionLogID =
    "z4EBG9j7zwuHzNwBcnKf2uB5dyHhdvd61VypgN7Lg9isLkZx4Fk" as ActionLogID;
  const firebaseKey = getFirebaseKeyForCIDString(testActionLogID);
  test("stability", () => {
    expect(firebaseKey).toMatchInlineSnapshot(
      `"8tBcgr6nE3UKhECkmvfue7RS6NydmPp2hyA3ppADJph8"`,
    );
  });
  test("round trip", () => {
    expect(getActionLogIDForFirebaseKey(firebaseKey)).toEqual(testActionLogID);
  });
});

test("task ID encoding stability", async () => {
  expect(
    await getFirebaseKeyForTaskID(
      "zdj7WbzHECp4HhW2uaxptud5n5QBnP3mEPTQVTW1zvNSLQDiw/basic",
    ),
  ).toEqual("1dPL56CjD6vn8WmC64akhatX7EXQXJgWkzMrGMwFpoR");
});
