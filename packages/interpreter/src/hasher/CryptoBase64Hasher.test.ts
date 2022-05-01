import { TaskContentType, TaskSpec, TaskSpecType } from "@withorbit/core";
import { CryptoBase64Hasher } from "./CryptoBase64Hasher";

it("hashes", () => {
  const object: TaskSpec = {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text: "Question", attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  };
  const hash = CryptoBase64Hasher.hash(object);
  expect(hash).toEqual("Opkh3stAIIc1KOXWg2FeT+rp4fAJQ6vLEVNuN/f1Poc=");
});

it("is a function of TaskContentType", () => {
  const objectA: TaskSpec = {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text: "Question", attachments: [] },
      answer: { text: "", attachments: [] },
    },
  };
  const objectB: TaskSpec = {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text: "Question", attachments: [] },
      components: {},
    },
  };
  const hashA = CryptoBase64Hasher.hash(objectA);
  const hashB = CryptoBase64Hasher.hash(objectB);
  expect(hashA).not.toEqual(hashB);
});

it("is not sensitive to key ordering", () => {
  const objectA: TaskSpec = {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.QA,
      body: { text: "Question", attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  };
  const objectB: TaskSpec = {
    content: {
      answer: { attachments: [], text: "Answer" },
      type: TaskContentType.QA,
      body: { text: "Question", attachments: [] },
    },
    type: TaskSpecType.Memory,
  };
  const hashA = CryptoBase64Hasher.hash(objectA);
  const hashB = CryptoBase64Hasher.hash(objectB);
  expect(hashA).toEqual(hashB);
});
