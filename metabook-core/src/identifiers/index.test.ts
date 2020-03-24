import CID from "cids";
import { PromptData } from "..";
import { getIDForPromptData } from "./index";

import multihash from "multihashes";

const testPromptData: PromptData = {
  cardType: "basic",
  question: "Test question",
  answer: "Test answer",
  explanation: null,
};

test("encoding stability", () => {
  expect(getIDForPromptData(testPromptData).toString()).toMatchInlineSnapshot(
    `"zdj7WWUeVhmRFyz2r148TBtebecpFDoc3CXn5fsNbMzZiH1cf"`,
  );
});

test("encodings are repeatable", () => {
  const a = getIDForPromptData(testPromptData);
  const b = getIDForPromptData({ ...testPromptData });
  expect(a).toEqual(b);
});

test("encoding metadata", () => {
  const cid = getIDForPromptData(testPromptData);
  const testCID = new CID(cid);
  expect(testCID.multibaseName).toEqual("base58btc");
  expect(multihash.decode(testCID.multihash).name).toEqual("sha2-256");
  expect(testCID.codec).toEqual("dag-pb");
});
