import CID from "cids";

import multihash from "multihashes";
import {
  ApplicationPromptSpec,
  AttachmentIDReference,
  getIDForAttachment,
} from "..";
import {
  testApplicationPromptSpec,
  testBasicPromptSpec,
  testClozePromptGroupSpec,
  testQAPromptSpec,
} from "../__tests__/sampleData";
import { getIDForPromptSpec } from "./promptSpecID";

test("encoding stability", () => {
  expect(
    getIDForPromptSpec(testBasicPromptSpec).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WXQPmKiV2DXSuGfpnTLrwRE5F2HAMJznC63vxJHCptRcR"`,
  );

  expect(
    getIDForPromptSpec(testApplicationPromptSpec).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WeP6nSgw44Dcyxz9ydsfuvVB6SfDWs1wQWTeeHvbkCxst"`,
  );

  expect(
    getIDForPromptSpec(testClozePromptGroupSpec).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WbQaeWpew3hGLirKSimxUv8MgGDRWTH1jhEtC9dy1jwG3"`,
  );
});

describe("encoding attachments", () => {
  const testAttachmentReference: AttachmentIDReference = {
    type: "image",
    id: getIDForAttachment(Buffer.from("abc")),
    byteLength: 10,
  };
  const testAttachmentReference2 = {
    ...testAttachmentReference,
    id: getIDForAttachment(Buffer.from("def")),
  };

  test("basic prompt attachments", () => {
    const basicPromptSpecID = getIDForPromptSpec(
      testBasicPromptSpec,
    ).toString();
    const oneAttachmentPromptSpecID = getIDForPromptSpec({
      ...testBasicPromptSpec,
      question: {
        ...testBasicPromptSpec.question,
        attachments: [testAttachmentReference],
      },
    }).toString();
    const attachmentsPromptSpecID = getIDForPromptSpec({
      ...testBasicPromptSpec,
      question: {
        ...testBasicPromptSpec.question,
        attachments: [testAttachmentReference, testAttachmentReference2],
      },
    });
    const multiFieldsPromptSpecID = getIDForPromptSpec({
      ...testBasicPromptSpec,
      question: {
        ...testBasicPromptSpec.question,
        attachments: [testAttachmentReference],
      },
      answer: {
        ...testBasicPromptSpec.answer,
        attachments: [testAttachmentReference2],
      },
    });
    expect(basicPromptSpecID).not.toEqual(oneAttachmentPromptSpecID);
    expect(oneAttachmentPromptSpecID).not.toEqual(attachmentsPromptSpecID);
    expect(attachmentsPromptSpecID).not.toEqual(multiFieldsPromptSpecID);

    expect(oneAttachmentPromptSpecID).toMatchInlineSnapshot(
      `"zdj7WcVkswQeBJgNoifPjYM3AXwdBLfHYaMFsjDLDFvnng9tj"`,
    );
    expect(attachmentsPromptSpecID).toMatchInlineSnapshot(
      `"zdj7WYS1e8XL6e7Y44UBDTj44DshcYaCeyta67CbUKbDEtRNq"`,
    );
    expect(multiFieldsPromptSpecID).toMatchInlineSnapshot(
      `"zdj7WVjZFXE7T5wpXG4pjWbo7ocd8fo4KMwjVy7vrkK16NLnv"`,
    );
  });

  describe("application prompt attachments", () => {
    test("variants have different attachments", () => {
      const testApplicationPrompt1: ApplicationPromptSpec = {
        promptSpecType: "applicationPrompt",
        variants: [
          {
            ...testBasicPromptSpec,
            question: {
              ...testBasicPromptSpec.question,
              attachments: [testAttachmentReference, testAttachmentReference2],
            },
          },
          testBasicPromptSpec,
        ],
      };
      const testApplicationPrompt2: ApplicationPromptSpec = {
        promptSpecType: "applicationPrompt",
        variants: [
          {
            ...testBasicPromptSpec,
            question: {
              ...testBasicPromptSpec.question,
              attachments: [testAttachmentReference],
            },
          },
          {
            ...testBasicPromptSpec,
            question: {
              ...testBasicPromptSpec.question,
              attachments: [testAttachmentReference2],
            },
          },
        ],
      };
      const testSpecID1 = getIDForPromptSpec(testApplicationPrompt1).toString();
      const testSpecID2 = getIDForPromptSpec(testApplicationPrompt2).toString();
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
  const a = getIDForPromptSpec(testBasicPromptSpec);
  const b = getIDForPromptSpec({ ...testBasicPromptSpec });
  expect(a).toEqual(b);
});

test("application prompts encodings depend on variants", () => {
  expect(getIDForPromptSpec(testApplicationPromptSpec)).not.toEqual(
    getIDForPromptSpec({
      ...testApplicationPromptSpec,
      variants: [testQAPromptSpec],
    }),
  );
});

test("encoding metadata", () => {
  const cid = getIDForPromptSpec(testBasicPromptSpec);
  const testCID = new CID(cid);
  expect(testCID.multibaseName).toEqual("base58btc");
  expect(multihash.decode(testCID.multihash).name).toEqual("sha2-256");
  expect(testCID.codec).toEqual("dag-pb");
});
