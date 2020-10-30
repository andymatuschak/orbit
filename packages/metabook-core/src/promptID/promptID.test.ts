import { base32 } from "multiformats/bases/base32";
import createTestAttachmentData from "../__tests__/createTestAttachmentData";
import {
  testApplicationPrompt,
  testClozePrompt,
  testQAPrompt,
} from "../__tests__/sampleData";
import { AttachmentID, getIDForAttachment } from "../types/attachmentID";
import { AttachmentIDReference } from "../types/attachmentIDReference";
import { ApplicationPrompt } from "../types/prompt";
import { getIDForPrompt } from "./promptID";
import CID from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { base58btc } from "multiformats/bases/base58";
import * as dagJSON from "@ipld/dag-json";

test("encoding stability", async () => {
  expect((await getIDForPrompt(testQAPrompt)).toString()).toMatchInlineSnapshot(
    `"z4EBG9j3P5ZMTbuTD8PzuJ5bSLGRNnb62m7LCSo3j356cbY11uW"`,
  );

  expect(
    (await getIDForPrompt(testApplicationPrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"z4EBG9jGungKDywnFkZvNVCMuTcUnkkRuKzqny99xwaiJLnLuUM"`,
  );

  expect(
    (await getIDForPrompt(testClozePrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"z4EBG9j8714FbNZodYEdunWCoq2Um2jGXMw5SduZnJw2ruRXCYq"`,
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
    const qaPromptID = (await getIDForPrompt(testQAPrompt)).toString();
    const oneAttachmentPromptID = (
      await getIDForPrompt({
        ...testQAPrompt,
        question: {
          ...testQAPrompt.question,
          attachments: [testAttachmentReference],
        },
      })
    ).toString();
    const attachmentsPromptID = await getIDForPrompt({
      ...testQAPrompt,
      question: {
        ...testQAPrompt.question,
        attachments: [testAttachmentReference, testAttachmentReference2],
      },
    });
    const multiFieldsPromptID = await getIDForPrompt({
      ...testQAPrompt,
      question: {
        ...testQAPrompt.question,
        attachments: [testAttachmentReference],
      },
      answer: {
        ...testQAPrompt.answer,
        attachments: [testAttachmentReference2],
      },
    });
    expect(qaPromptID).not.toEqual(oneAttachmentPromptID);
    expect(oneAttachmentPromptID).not.toEqual(attachmentsPromptID);
    expect(attachmentsPromptID).not.toEqual(multiFieldsPromptID);

    expect(oneAttachmentPromptID).toMatchInlineSnapshot(
      `"z4EBG9jCpnUvEJqDhvL6AVwVjUvgN8Zm3nHmJsvsmtDrBY5aQvP"`,
    );
    expect(attachmentsPromptID).toMatchInlineSnapshot(
      `"z4EBG9jAQmoKMSF5Tv4ideXqVrhTuv527R7Hm7324ik9QWgYy7o"`,
    );
    expect(multiFieldsPromptID).toMatchInlineSnapshot(
      `"z4EBG9j8GJeXoxQJG7VLkCBCxa7EQHfT3gPWtn8XWxHBsxw7Jvc"`,
    );

    // The prompt CID should not depend on the choice of attachment CID encoding.
    // We'll hackily re-encode the attachment CID to demonstrate that.
    const variantAttachmentID = CID.parse(testAttachmentReference.id).toString(
      base32,
    );
    const variantAttachmentPromptID = (
      await getIDForPrompt({
        ...testQAPrompt,
        question: {
          ...testQAPrompt.question,
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
            ...testQAPrompt,
            question: {
              ...testQAPrompt.question,
              attachments: [testAttachmentReference, testAttachmentReference2],
            },
          },
          testQAPrompt,
        ],
      };
      const testApplicationPrompt2: ApplicationPrompt = {
        promptType: "applicationPrompt",
        variants: [
          {
            ...testQAPrompt,
            question: {
              ...testQAPrompt.question,
              attachments: [testAttachmentReference],
            },
          },
          {
            ...testQAPrompt,
            question: {
              ...testQAPrompt.question,
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
  const a = await getIDForPrompt(testQAPrompt);
  const b = await getIDForPrompt({ ...testQAPrompt });
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
  const cid = await getIDForPrompt(testQAPrompt);
  const testCID = CID.parse(cid);
  expect(cid.slice(0, 1)).toEqual(base58btc.prefix);
  expect(testCID.code).toEqual(dagJSON.code);
  expect(testCID.multihash.code).toEqual(sha256.code);
});
