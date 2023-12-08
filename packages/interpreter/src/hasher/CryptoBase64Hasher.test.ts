import { TaskContentType, TaskSpec, TaskSpecType } from "@withorbit/core";
import { CryptoBase64Hasher } from "./CryptoBase64Hasher.js";

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

it("generates different outputs for identical cloze strings with different ranges", () => {
  const a: TaskSpec = {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text: "Foo", attachments: [] },
      components: {
        "0": { order: 0, ranges: [{ hint: null, startIndex: 0, length: 1 }] },
      },
    },
  };
  const b: TaskSpec = {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text: "Foo", attachments: [] },
      components: {
        "0": { order: 0, ranges: [{ hint: null, startIndex: 0, length: 1 }] },
        "1": { order: 1, ranges: [{ hint: null, startIndex: 2, length: 1 }] },
      },
    },
  };
  expect(CryptoBase64Hasher.hash(a)).not.toEqual(CryptoBase64Hasher.hash(b));
});
