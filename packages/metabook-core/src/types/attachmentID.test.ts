import createTestAttachmentData from "../__tests__/createTestAttachmentData";
import { getIDForAttachment } from "./attachmentID";

test("attachment ID stability", async () => {
  const data = createTestAttachmentData(
    "Curae porta integer vitae facilisis eros nostra",
  );
  expect(await getIDForAttachment(data)).toMatchInlineSnapshot(
    `"zSYwdZFd2UHgtQL5at38exe6YJEFdVUH1PXPvup6yYoG7nDnq"`,
  );
});
