import CID from "cids";
import multihash from "multihashes";
import createTestAttachmentData from "../__tests__/createTestAttachmentData";
import {
  testApplicationPrompt,
  testBasicPrompt,
  testClozePrompt,
  testQAPrompt,
} from "../__tests__/sampleData";
import { getIDForAttachment } from "../types/attachmentID";
import { AttachmentIDReference } from "../types/attachmentIDReference";
import { ApplicationPrompt } from "../types/prompt";
import { getIDForPrompt } from "./promptID";

test("encoding stability", async () => {
  expect(
    (await getIDForPrompt(testBasicPrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WXQPmKiV2DXSuGfpnTLrwRE5F2HAMJznC63vxJHCptRcR"`,
  );

  expect(
    (await getIDForPrompt(testApplicationPrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WeP6nSgw44Dcyxz9ydsfuvVB6SfDWs1wQWTeeHvbkCxst"`,
  );

  expect(
    (await getIDForPrompt(testClozePrompt)).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WbQaeWpew3hGLirKSimxUv8MgGDRWTH1jhEtC9dy1jwG3"`,
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
      `"zdj7WciLWE9sSi6gnLetDG1n65LSUryEAdQDiDMczcJi1PumR"`,
    );
    expect(attachmentsPromptID).toMatchInlineSnapshot(
      `"zdj7WkDELztN64ex2nXAeYZmEFhoghoTrsq8P5UdpJ3ifvHzX"`,
    );
    expect(multiFieldsPromptID).toMatchInlineSnapshot(
      `"zdj7Wj4jGXoT5wi72uuFa2WS6UnMupL4ESqTwi61e6aMShZ16"`,
    );
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
        `"zdj7WWCU9hZJsdRESkqcXrng4tqokjyPieyU4tqezUBMXETag"`,
      );
      expect(testSpecID2).toMatchInlineSnapshot(
        `"zdj7WhgKbgCYj1YzZBUGf7RXhNo8DrfQE8j8zRAnDUu9ZwrQz"`,
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
  const testCID = new CID(cid);
  expect(testCID.multibaseName).toEqual("base58btc");
  expect(multihash.decode(testCID.multihash).name).toEqual("sha2-256");
  expect(testCID.codec).toEqual("dag-pb");
});
