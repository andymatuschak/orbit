import createTestAttachmentData from "../__tests__/createTestAttachmentData";
import { getIDForAttachment } from "./attachmentID";

test("attachment ID stability", async () => {
  const data = createTestAttachmentData(
    "Curae porta integer vitae facilisis eros nostra",
  );
  expect(await getIDForAttachment(data)).toMatchInlineSnapshot(
    `"zb2rhXaeJ922fgKU1sHug4EhfEUQdA3oFRUV6CumZuUoZhgf3"`,
  );
});
