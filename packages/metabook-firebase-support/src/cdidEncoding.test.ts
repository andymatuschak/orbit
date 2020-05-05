import { ActionLogID, AttachmentID, PromptID } from "metabook-core";
import {
  getActionLogIDForFirebaseKey,
  getAttachmentIDForFirebaseKey,
  getFirebaseKeyForCIDString,
  getPromptIDForFirebaseKey,
} from "./cdidEncoding";

describe("prompt ID", () => {
  const testPromptID = "zdj7WbQaeWpew3hGLirKSimxUv8MgGDRWTH1jhEtC9dy1jwG3" as PromptID;
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
  const testAttachmentID = "zSYwdZFd2UHgtQL5at38exe6YJEFdVUH1PXPvup6yYoG7nDnq" as AttachmentID;
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
  const testActionLogID = "zdj7WdK5hE3wmUdpfboMfmkFm8qmdoJYmqBF3BoqhueNy5Qw4" as ActionLogID;
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
