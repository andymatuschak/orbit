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

test("encoding stability", () => {
  expect(getIDForPrompt(testBasicPrompt).toString()).toMatchInlineSnapshot(
    `"zdj7WXQPmKiV2DXSuGfpnTLrwRE5F2HAMJznC63vxJHCptRcR"`,
  );

  expect(
    getIDForPrompt(testApplicationPrompt).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WeP6nSgw44Dcyxz9ydsfuvVB6SfDWs1wQWTeeHvbkCxst"`,
  );

  expect(getIDForPrompt(testClozePrompt).toString()).toMatchInlineSnapshot(
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

  test("basic prompt attachments", () => {
    const basicPromptID = getIDForPrompt(testBasicPrompt).toString();
    const oneAttachmentPromptID = getIDForPrompt({
      ...testBasicPrompt,
      question: {
        ...testBasicPrompt.question,
        attachments: [testAttachmentReference],
      },
    }).toString();
    const attachmentsPromptID = getIDForPrompt({
      ...testBasicPrompt,
      question: {
        ...testBasicPrompt.question,
        attachments: [testAttachmentReference, testAttachmentReference2],
      },
    });
    const multiFieldsPromptID = getIDForPrompt({
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
      `"zdj7WcVkswQeBJgNoifPjYM3AXwdBLfHYaMFsjDLDFvnng9tj"`,
    );
    expect(attachmentsPromptID).toMatchInlineSnapshot(
      `"zdj7WYS1e8XL6e7Y44UBDTj44DshcYaCeyta67CbUKbDEtRNq"`,
    );
    expect(multiFieldsPromptID).toMatchInlineSnapshot(
      `"zdj7WVjZFXE7T5wpXG4pjWbo7ocd8fo4KMwjVy7vrkK16NLnv"`,
    );
  });

  describe("application prompt attachments", () => {
    test("variants have different attachments", () => {
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
      const testSpecID1 = getIDForPrompt(testApplicationPrompt1).toString();
      const testSpecID2 = getIDForPrompt(testApplicationPrompt2).toString();
      expect(testSpecID1).not.toEqual(testSpecID2);

      expect(testSpecID1).toMatchInlineSnapshot(
        `"zdj7WbR6s6G4LLMweN9EoyLfTkxjdTr2paJZkLakKaA2acEzc"`,
      );
      expect(testSpecID2).toMatchInlineSnapshot(
        `"zdj7WjCQ62HfzMSCFoycD3fXBi5njp1TKj3aHDU1ZJi2vmoPu"`,
      );
    });
  });
});

test("encodings are repeatable", () => {
  const a = getIDForPrompt(testBasicPrompt);
  const b = getIDForPrompt({ ...testBasicPrompt });
  expect(a).toEqual(b);
});

test("application prompts encodings depend on variants", () => {
  expect(getIDForPrompt(testApplicationPrompt)).not.toEqual(
    getIDForPrompt({
      ...testApplicationPrompt,
      variants: [testQAPrompt],
    }),
  );
});

test("encoding metadata", () => {
  const cid = getIDForPrompt(testBasicPrompt);
  const testCID = new CID(cid);
  expect(testCID.multibaseName).toEqual("base58btc");
  expect(multihash.decode(testCID.multihash).name).toEqual("sha2-256");
  expect(testCID.codec).toEqual("dag-pb");
});
