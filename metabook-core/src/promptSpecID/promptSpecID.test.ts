import CID from "cids";
import {
  ApplicationPromptSpec,
  BasicPromptSpec,
  basicPromptSpecType,
  ClozePromptGroupSpec,
  PromptSpec,
  QAPromptSpec,
} from "../types/promptSpec";
import { getIDForPromptSpec } from "./promptSpecID";

import multihash from "multihashes";

const testQAPromptSpecData: QAPromptSpec = {
  question: "Test question",
  answer: "Test answer",
  explanation: null,
};

const testBasicPromptSpec: BasicPromptSpec = {
  ...testQAPromptSpecData,
  promptSpecType: basicPromptSpecType,
};

const testApplicationPromptData: ApplicationPromptSpec = {
  promptSpecType: "applicationPrompt",
  variants: [testQAPromptSpecData, testQAPromptSpecData],
};

const testClozePromptGroupData: ClozePromptGroupSpec = {
  promptSpecType: "cloze",
  contents: "Test {cloze}",
};

test("encoding stability", () => {
  expect(
    getIDForPromptSpec(testBasicPromptSpec).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WXQPmKiV2DXSuGfpnTLrwRE5F2HAMJznC63vxJHCptRcR"`,
  );

  expect(
    getIDForPromptSpec(testApplicationPromptData).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WeP6nSgw44Dcyxz9ydsfuvVB6SfDWs1wQWTeeHvbkCxst"`,
  );

  expect(
    getIDForPromptSpec(testClozePromptGroupData).toString(),
  ).toMatchInlineSnapshot(
    `"zdj7WbQaeWpew3hGLirKSimxUv8MgGDRWTH1jhEtC9dy1jwG3"`,
  );
});

test("encodings are repeatable", () => {
  const a = getIDForPromptSpec(testBasicPromptSpec);
  const b = getIDForPromptSpec({ ...testBasicPromptSpec });
  expect(a).toEqual(b);
});

test("application prompts encodings depend on variants", () => {
  expect(getIDForPromptSpec(testApplicationPromptData)).not.toEqual(
    getIDForPromptSpec({
      ...testApplicationPromptData,
      variants: [testQAPromptSpecData],
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
