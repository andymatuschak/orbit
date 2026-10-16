import {
  ClozeTaskContent,
  TaskContentType,
  TaskSpecType,
} from "@withorbit/core";
import type { IngestibleItemIdentifier } from "@withorbit/ingester";
import { expect, test } from "bun:test";
import { interpretMarkdownFiles, type MarkdownFile } from "./interpret.js";

// These tests exercise the import boundary rather than remark's intermediate
// nodes: equivalent parser output must not create new tasks on the next import.
function interpret(content: string, file: Partial<MarkdownFile> = {}) {
  const result = interpretMarkdownFiles([
    { name: "Source.md", path: "/notes/Source.md", content, ...file },
  ]);
  expect(result.sources).toHaveLength(1);
  return result.sources[0];
}

test("equivalent Markdown produces the same normalized spec and import identifier", () => {
  const first = interpret(`# First title

Q. **Question** with [a link](https://example.com).
A. _Answer_ with \`code\`.

Unrelated paragraph.`);
  const second = interpret(`# Different title

Q. __Question__ with [a link](https://example.com).

A. *Answer* with \`code\`.
`);

  expect(first.items).toEqual([
    {
      identifier:
        "F/t/C4564nVuUzCb2NUXkh9Rvb3BlXHH6ap4zGXGV6c=" as IngestibleItemIdentifier,
      spec: {
        type: TaskSpecType.Memory,
        content: {
          type: TaskContentType.QA,
          body: {
            text: "**Question** with [a link](https://example.com).",
            attachments: [],
          },
          answer: { text: "*Answer* with `code`.", attachments: [] },
        },
      },
    },
  ]);
  expect(second.items).toEqual(first.items);

  const edited = interpret(
    "# Heading\n\nQ. **Question** with [a link](https://example.com).\nA. Changed answer.",
  );
  expect(edited.items[0].identifier).not.toEqual(first.items[0].identifier);
});

test("a note can begin directly with a QA prompt", () => {
  const source = interpret("Q. Question\nA. Answer");

  expect(source.items.map((item) => item.spec.content)).toEqual([
    {
      type: TaskContentType.QA,
      body: { text: "Question", attachments: [] },
      answer: { text: "Answer", attachments: [] },
    },
  ]);
});

test("an unmatched question at EOF is not a prompt", () => {
  const source = interpret("# Note\n\nQ. An unfinished question");

  expect(source.items).toEqual([]);
});

test("a frontmatter-only note has no prompts and falls back to its filename", () => {
  const source = interpret("---\ntitle: A metadata title\n---\n");

  expect(source.items).toEqual([]);
  expect(source.title).toEqual("Source.md");
});

test("multiblock QA retains lists and quotes without swallowing the next prompt", () => {
  const source = interpret(`# Source

Q.
First paragraph.

* First item
* Second item

A.
Answer paragraph.

> A quotation.

Q. Next question
A. Next answer

Outside.`);

  expect(source.items.map((item) => item.spec.content)).toEqual([
    {
      type: TaskContentType.QA,
      body: {
        text: "First paragraph.\n\n* First item\n* Second item",
        attachments: [],
      },
      answer: {
        text: "Answer paragraph.\n\n> A quotation.",
        attachments: [],
      },
    },
    {
      type: TaskContentType.QA,
      body: { text: "Next question", attachments: [] },
      answer: { text: "Next answer", attachments: [] },
    },
  ]);
});

test("QA boundaries exclude quoted, listed, incomplete, and backlink prompts", () => {
  const source = interpret(`# Context

> Q. Quoted
> A. Quoted answer

* Q. List question
  A. List answer

Q. Incomplete

Separate paragraph

A. Orphan answer

Q. Real question
A. Real answer

## Backlinks

Q. Backlink question
A. Backlink answer

Backlink {cloze}.

## Later

Later {visible}.`);

  expect(source.items).toHaveLength(2);
  expect(
    source.items.find((item) => item.spec.content.type === TaskContentType.QA)
      ?.spec.content,
  ).toEqual({
    type: TaskContentType.QA,
    body: { text: "Real question", attachments: [] },
    answer: { text: "Real answer", attachments: [] },
  });
  expect(
    source.items.find(
      (item) => item.spec.content.type === TaskContentType.Cloze,
    )?.spec.content.body.text,
  ).toEqual("Later visible.");
});

test("cloze ranges describe normalized Markdown including links and nested math braces", () => {
  const source = interpret(
    "An {**important** [link](https://example.com)} and {a $x^{2}$ formula}.",
  );

  expect(source.items).toHaveLength(1);
  expect(source.items[0]).toEqual({
    identifier:
      "ih5ABNp5aEUl2cwt+7ygGpUp8bAmzJSBnFIMPG87GNM=" as IngestibleItemIdentifier,
    spec: {
      type: TaskSpecType.Memory,
      content: {
        type: TaskContentType.Cloze,
        body: {
          text: "An **important** [link](https://example.com) and a $x^{2}$ formula.",
          attachments: [],
        },
        components: {
          "0": {
            order: 0,
            ranges: [{ hint: null, startIndex: 3, length: 41 }],
          },
          "1": {
            order: 1,
            ranges: [{ hint: null, startIndex: 49, length: 17 }],
          },
        },
      },
    },
  });
  const content = source.items[0].spec.content as ClozeTaskContent;
  expect(
    Object.values(content.components).map(({ ranges: [range] }) =>
      content.body.text.slice(
        range.startIndex,
        range.startIndex + range.length,
      ),
    ),
  ).toEqual(["**important** [link](https://example.com)", "a $x^{2}$ formula"]);
});

test("escaped braces, code, math, HTML, and link destinations are not clozes", () => {
  const source =
    interpret(`\\{escaped\\} \`{inline code}\` \${math}$ [literal](https://example.com/{destination})

~~~text
{fenced code}
~~~

<div>{HTML}</div>

Real {answer}.`);

  expect(source.items).toHaveLength(1);
  expect(source.items[0].spec.content).toEqual({
    type: TaskContentType.Cloze,
    body: { text: "Real answer.", attachments: [] },
    components: {
      "0": {
        order: 0,
        ranges: [{ hint: null, startIndex: 5, length: 6 }],
      },
    },
  });
});

test("Bear identity survives file moves and does not enter task content", () => {
  const bearID = "860466DE-8254-47C1-AA71-BA9C0CE18FA3-402-00002ED1CDC440DA";
  const content = `---
title: Not the rendered title
---
# **Study** note

Q. Question
A. Answer

<!-- {BearID:${bearID}} -->`;
  const before = interpret(content);
  const after = interpret(content, {
    name: "Renamed.md",
    path: "/elsewhere/Renamed.md",
  });

  expect(before).toEqual(after);
  expect<string>(before.identifier).toEqual(bearID);
  expect(before.url).toEqual(`bear://x-callback-url/open-note?id=${bearID}`);
  expect(before.title).toEqual("**Study** note");
  expect(before.items[0].spec.content).toEqual({
    type: TaskContentType.QA,
    body: { text: "Question", attachments: [] },
    answer: { text: "Answer", attachments: [] },
  });
});

test("without Bear metadata the path, not content or filename, identifies the source", () => {
  const content = "# Heading\n\nQ. Question\nA. Answer";
  const before = interpret(content);
  const after = interpret(content, { path: "/elsewhere/Source.md" });

  expect<string>(before.identifier).toEqual("/notes/Source.md");
  expect<string>(after.identifier).toEqual("/elsewhere/Source.md");
  expect(before.url).toBeUndefined();
  expect(before.items).toEqual(after.items);
});
