import createTestAttachmentData from "../__tests__/createTestAttachmentData";
import {
  testApplicationPrompt,
  testBasicPrompt,
  testClozePrompt,
  testQAPrompt,
} from "../__tests__/sampleData";
import { AttachmentID, getIDForAttachment } from "../types/attachmentID";
import { AttachmentIDReference } from "../types/attachmentIDReference";
import { ApplicationPrompt } from "../types/prompt";
import { CID, multibase, multihash, multicodec } from "../util/cids";
import { getIDForPrompt } from "./promptID";

test("encoding stability", async () => {
  expect(
    (await getIDForPrompt(testBasicPrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"z4EBG9j8Gqw9fBVw4rucCxBULZJgZsAmWFRWHRq2Fx1XShp44kW"`,
  );

  expect(
    (await getIDForPrompt(testApplicationPrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"z4EBG9jGungKDywnFkZvNVCMuTcUnkkRuKzqny99xwaiJLnLuUM"`,
  );

  expect(
    (await getIDForPrompt(testClozePrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"z4EBG9j7yAXAJsfnLeE9y3D2BVCjr45bdUM45RDSy55RuTRAZDB"`,
  );
});

describe("encoding attachments", () => {
  let testAttachmentReference: AttachmentIDReference;
  let testAttachmentReference2: AttachmentIDReference;

  beforeAll(async () => {
    testAttachmentReference = {
      type: "image",
      id: await getIDForAttachment(createTestAttachmentData("abc")),
      byteLength: 10,
    };
    testAttachmentReference2 = {
      ...testAttachmentReference,
      id: await getIDForAttachment(createTestAttachmentData("def")),
    };
  });

  test("basic prompt attachments", async () => {
    const basicPromptID = (await getIDForPrompt(testBasicPrompt)).toString();
    const oneAttachmentPromptID = (
      await getIDForPrompt({
        ...testBasicPrompt,
        question: {
          ...testBasicPrompt.question,
          attachments: [testAttachmentReference],
        },
      })
    ).toString();
    const attachmentsPromptID = await getIDForPrompt({
      ...testBasicPrompt,
      question: {
        ...testBasicPrompt.question,
        attachments: [testAttachmentReference, testAttachmentReference2],
      },
    });
    const multiFieldsPromptID = await getIDForPrompt({
      ...testBasicPrompt,
      question: {
        ...testBasicPrompt.question,
        attachments: [testAttachmentReference],
      },
      answer: {
        ...testBasicPrompt.answer,
        attachments: [testAttachmentReference2],
      },
    });
    expect(basicPromptID).not.toEqual(oneAttachmentPromptID);
    expect(oneAttachmentPromptID).not.toEqual(attachmentsPromptID);
    expect(attachmentsPromptID).not.toEqual(multiFieldsPromptID);

    expect(oneAttachmentPromptID).toMatchInlineSnapshot(
      `"z4EBG9j26qVhd37BoCcU4FksgPpVEFj3mjGYoV6dekcjcRDWqJc"`,
    );
    expect(attachmentsPromptID).toMatchInlineSnapshot(
      `"z4EBG9jDMHbWNgE8ha1DWc3Rg2zC2cZb6c3GwiASFEP8t2LubL5"`,
    );
    expect(multiFieldsPromptID).toMatchInlineSnapshot(
      `"z4EBG9j1enHPeqRYFwtMes7GXjUHfCnn33dpy2apJBsCaFfRvcV"`,
    );

    // The prompt CID should not depend on the choice of attachment CID encoding.
    // We'll hackily re-encode the attachment CID to demonstrate that.
    const variantAttachmentID = CID.from(testAttachmentReference.id).toString(
      "base32",
    );
    const variantAttachmentPromptID = (
      await getIDForPrompt({
        ...testBasicPrompt,
        question: {
          ...testBasicPrompt.question,
          attachments: [
            {
              ...testAttachmentReference,
              id: variantAttachmentID as AttachmentID,
            },
          ],
        },
      })
    ).toString();
    expect(variantAttachmentPromptID).toEqual(oneAttachmentPromptID);
  });

  describe("application prompt attachments", () => {
    test("variants have different attachments", async () => {
      const testApplicationPrompt1: ApplicationPrompt = {
        promptType: "applicationPrompt",
        variants: [
          {
            ...testBasicPrompt,
            question: {
              ...testBasicPrompt.question,
              attachments: [testAttachmentReference, testAttachmentReference2],
            },
          },
          testBasicPrompt,
        ],
      };
      const testApplicationPrompt2: ApplicationPrompt = {
        promptType: "applicationPrompt",
        variants: [
          {
            ...testBasicPrompt,
            question: {
              ...testBasicPrompt.question,
              attachments: [testAttachmentReference],
            },
          },
          {
            ...testBasicPrompt,
            question: {
              ...testBasicPrompt.question,
              attachments: [testAttachmentReference2],
            },
          },
        ],
      };
      const testSpecID1 = (
        await getIDForPrompt(testApplicationPrompt1)
      ).toString();
      const testSpecID2 = (
        await getIDForPrompt(testApplicationPrompt2)
      ).toString();
      expect(testSpecID1).not.toEqual(testSpecID2);

      expect(testSpecID1).toMatchInlineSnapshot(
        `"z4EBG9jEWnYnXcGEhncdQLqBVCh9FU7H4RDGG6XHMKAuaAy8G9F"`,
      );
      expect(testSpecID2).toMatchInlineSnapshot(
        `"z4EBG9j5kuJpWCraVw1T3QeTDBvgKf41YWbZ1GDXM7RjQt6ca4F"`,
      );
    });
  });
});

test("encodings are repeatable", async () => {
  const a = await getIDForPrompt(testBasicPrompt);
  const b = await getIDForPrompt({ ...testBasicPrompt });
  expect(a).toEqual(b);
});

test("application prompts encodings depend on variants", async () => {
  expect(await getIDForPrompt(testApplicationPrompt)).not.toEqual(
    await getIDForPrompt({
      ...testApplicationPrompt,
      variants: [testQAPrompt],
    }),
  );
});

test("encoding metadata", async () => {
  const cid = await getIDForPrompt(testBasicPrompt);
  const testCID = CID.from(cid);
  expect(multibase.encoding(cid).name).toEqual("base58btc");
  expect(testCID.code).toEqual(multicodec.get("dag-json").code);
  expect(multihash.decode(testCID.multihash).name).toEqual("sha2-256");
});
