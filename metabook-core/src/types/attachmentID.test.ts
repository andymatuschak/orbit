import { getIDForAttachment } from "./attachmentID";

test("attachment ID stability", () => {
  const testAttachmentBuffer = Buffer.from(
    "Curae porta integer vitae facilisis eros nostra",
  );
  expect(getIDForAttachment(testAttachmentBuffer)).toMatchInlineSnapshot(
    `"zSYwdZFd2UHgtQL5at38exe6YJEFdVUH1PXPvup6yYoG7nDnq"`,
  );
});
