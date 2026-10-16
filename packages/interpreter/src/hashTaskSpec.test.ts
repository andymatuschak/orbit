import {
  TaskContentType,
  TaskSpecType,
  type ClozeTaskContent,
  type TaskSpec,
} from "@withorbit/core";
import { expect, it } from "bun:test";
import { hashTaskSpec } from "./hashTaskSpec.js";

const qa: TaskSpec = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.QA,
    body: { text: "Question", attachments: [] },
    answer: { text: "Answer", attachments: [] },
  },
};

const cloze: TaskSpec<ClozeTaskContent> = {
  type: TaskSpecType.Memory,
  content: {
    type: TaskContentType.Cloze,
    body: { text: "Foo bar", attachments: [] },
    components: {
      "0": { order: 0, ranges: [{ hint: null, startIndex: 0, length: 3 }] },
      "1": { order: 1, ranges: [{ hint: "noun", startIndex: 4, length: 3 }] },
    },
  },
};

it("preserves historical hashes for every content type", () => {
  expect(hashTaskSpec(qa)).toBe("Opkh3stAIIc1KOXWg2FeT+rp4fAJQ6vLEVNuN/f1Poc=");
  expect(hashTaskSpec(cloze)).toBe(
    "TWgphHRchWp2OikwoLrb/UMBLxkXlali8vP4JS8Voro=",
  );
  expect(
    hashTaskSpec({
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.Plain,
        body: { text: "Remember this", attachments: [] },
      },
    }),
  ).toBe("/9jbFYR/avTIhWhAFYgrG/fpRy2py7ELxwzlCebw6d0=");
});

it("includes the content type even when displayed text is identical", () => {
  const question = { text: "Question", attachments: [] };
  expect(
    hashTaskSpec({
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.QA,
        body: question,
        answer: { text: "", attachments: [] },
      },
    }),
  ).not.toBe(
    hashTaskSpec({
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.Cloze,
        body: question,
        components: {},
      },
    }),
  );
});

it("ignores object field ordering", () => {
  expect(
    hashTaskSpec({
      content: {
        answer: { attachments: [], text: "Answer" },
        type: TaskContentType.QA,
        body: { attachments: [], text: "Question" },
      },
      type: TaskSpecType.Memory,
    }),
  ).toBe(hashTaskSpec(qa));
  expect(
    hashTaskSpec({
      content: {
        components: {
          "0": { ranges: [{ length: 3, startIndex: 0, hint: null }], order: 0 },
          "1": {
            ranges: [{ length: 3, hint: "noun", startIndex: 4 }],
            order: 1,
          },
        },
        body: { attachments: [], text: "Foo bar" },
        type: TaskContentType.Cloze,
      },
      type: TaskSpecType.Memory,
    }),
  ).toBe(hashTaskSpec(cloze));
});

it("includes each cloze component and all of its range fields", () => {
  for (const change of [
    (spec: typeof cloze) => delete spec.content.components["1"],
    (spec: typeof cloze) => (spec.content.components["0"].order = 1),
    (spec: typeof cloze) => (spec.content.components["0"].ranges[0].hint = ""),
    (spec: typeof cloze) =>
      (spec.content.components["0"].ranges[0].startIndex = 1),
    (spec: typeof cloze) => (spec.content.components["0"].ranges[0].length = 2),
  ]) {
    const changed = structuredClone(cloze);
    change(changed);
    expect(hashTaskSpec(changed)).not.toBe(hashTaskSpec(cloze));
  }
});

it("preserves component and range iteration order instead of silently sorting", () => {
  const forward: TaskSpec<ClozeTaskContent> = {
    type: TaskSpecType.Memory,
    content: {
      type: TaskContentType.Cloze,
      body: { text: "Foo bar", attachments: [] },
      components: {
        first: { order: 0, ranges: [{ hint: null, startIndex: 0, length: 3 }] },
        second: {
          order: 1,
          ranges: [{ hint: null, startIndex: 4, length: 3 }],
        },
      },
    },
  };
  const reversed = structuredClone(forward);
  reversed.content.components = Object.fromEntries(
    Object.entries(reversed.content.components).reverse(),
  );
  expect(hashTaskSpec(reversed)).not.toBe(hashTaskSpec(forward));

  const ranges = structuredClone(forward);
  ranges.content.components.first.ranges.push({
    hint: null,
    startIndex: 4,
    length: 3,
  });
  const reversedRanges = structuredClone(ranges);
  reversedRanges.content.components.first.ranges.reverse();
  expect(hashTaskSpec(reversedRanges)).not.toBe(hashTaskSpec(ranges));
});
