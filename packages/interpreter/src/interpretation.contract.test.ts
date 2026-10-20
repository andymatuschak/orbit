import {
  ClozeTaskContent,
  TaskContentType,
  TaskSpecType,
  type TaskID,
} from "@withorbit/core";
import {
  createIngestibleValidator,
  INGEST_ITEM_IDENTIFIER_KEY,
  ingestSources,
  type IngestibleItemIdentifier,
} from "@withorbit/ingester";
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

test("Bear export metadata preserves a multiblock answer's content and hash", () => {
  const content =
    "# Source\n\nQ. Question\nA.\nFirst paragraph.\n\nSecond paragraph.";
  const original = interpret(content);
  for (const newline of ["\n", "\r\n"]) {
    const exported = interpret(
      `${content}\n\n<!-- {BearID:ABC-123} -->\n`.replaceAll("\n", newline),
    );
    expect<string>(exported.identifier).toBe("ABC-123");
    expect(exported.url).toBe("bear://x-callback-url/open-note?id=ABC-123");
    expect(exported.items).toEqual(original.items);
  }
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

test("explicit cloze IDs change identity, not rendered Markdown or UTF-16 ranges", () => {
  const plain = interpret(
    "🦉 An {**important** [link](https://example.com)} and {a $x^{2}$ 🌈 formula}.",
  ).items[0].spec.content as ClozeTaskContent;
  const labeled = interpret(
    "🦉 An {meaning::**important** [link](https://example.com)} and {equation-2::a $x^{2}$ 🌈 formula}.",
  ).items[0].spec.content as ClozeTaskContent;
  expect(labeled).toEqual({
    ...plain,
    components: {
      meaning: plain.components["0"],
      "equation-2": plain.components["1"],
    },
  });
  expect(
    Object.values(labeled.components).map(({ ranges: [range] }) =>
      labeled.body.text.slice(
        range.startIndex,
        range.startIndex + range.length,
      ),
    ),
  ).toEqual([
    "**important** [link](https://example.com)",
    "a $x^{2}$ 🌈 formula",
  ]);
});

test("explicit numeric cloze IDs can preserve legacy normalized content and hashes", () => {
  const plain = interpret("The {cat} sat on the {mat}.");
  const labeled = interpret("The {0::cat} sat on the {1::mat}.");
  expect(labeled.items).toEqual(plain.items);
});

test("mixed labeled and unlabeled clozes keep appearance order and positional defaults", () => {
  const content = interpret("{subject::cat} met {dog} near {place::home}.")
    .items[0].spec.content as ClozeTaskContent;
  expect(Object.keys(content.components).sort()).toEqual([
    "1",
    "place",
    "subject",
  ]);
  expect(content.components.subject.order).toBe(0);
  expect(content.components["1"].order).toBe(1);
  expect(content.components.place.order).toBe(2);
});

test("explicit cloze IDs follow their blanks when reordered", () => {
  const first = interpret("The {animal::cat} sat on the {place::mat}.").items[0]
    .spec.content as ClozeTaskContent;
  const second = interpret("The {place::mat} held the {animal::cat}.").items[0]
    .spec.content as ClozeTaskContent;
  for (const id of ["animal", "place"]) {
    const before = first.components[id].ranges[0];
    const after = second.components[id].ranges[0];
    expect(
      first.body.text.slice(
        before.startIndex,
        before.startIndex + before.length,
      ),
    ).toBe(
      second.body.text.slice(after.startIndex, after.startIndex + after.length),
    );
  }
  expect(first.components.animal.order).toBe(0);
  expect(second.components.animal.order).toBe(1);
  expect(first.components.place.order).toBe(1);
  expect(second.components.place.order).toBe(0);
});

test.each([
  "{same::first} and {same::second}",
  "{1::first} and {second}",
  "{first} and {0::second}",
])(
  "duplicate cloze IDs cannot silently group or overwrite blanks: %s",
  (text) => {
    expect(() => interpret(text)).toThrow(
      /Cloze component ID .* is used more than once/,
    );
  },
);

test("cloze IDs are scoped to their task, including JavaScript property names", () => {
  const source = interpret(
    "{__proto__::first} {constructor::second} {toString::third}.\n\n{__proto__::fourth}.",
  );
  expect(source.items).toHaveLength(2);
  const first = source.items[0].spec.content as ClozeTaskContent;
  expect(Object.keys(first.components)).toEqual([
    "__proto__",
    "constructor",
    "toString",
  ]);
  expect(Object.values(first.components).map(({ order }) => order)).toEqual([
    0, 1, 2,
  ]);
  const second = source.items[1].spec.content as ClozeTaskContent;
  expect(Object.keys(second.components)).toEqual(["__proto__"]);
  expect(second.components["__proto__"].order).toBe(0);
});

test("empty identified blanks remain prose without swallowing nearby valid blanks", () => {
  const source = interpret("Empty {unused::} followed by {answer::content}.");
  const content = source.items[0].spec.content as ClozeTaskContent;
  expect(content.body.text).toBe("Empty {unused::} followed by content.");
  expect(Object.keys(content.components)).toEqual(["answer"]);
  expect(content.components.answer.order).toBe(0);
});

test("a literal escaped ID prefix stays in the answer rather than naming its component", () => {
  const content = interpret("A {literal\\::answer}.").items[0].spec
    .content as ClozeTaskContent;
  expect(Object.keys(content.components)).toEqual(["0"]);
  expect(content.body.text).toBe("A literal::answer.");
  const range = content.components["0"].ranges[0];
  expect(
    content.body.text.slice(range.startIndex, range.startIndex + range.length),
  ).toBe("literal::answer");
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
  expect(before.items[0].url).toBeUndefined();
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

for (const [name, markdown] of [
  ["QA", "Q. Front\nA. Back"],
  ["multiblock QA", "Q. Front\nA.\nFirst paragraph.\n\nSecond paragraph."],
  ["cloze", "{Paris} is the capital of {country::France}."],
]) {
  for (const prefix of ["orbit://task/", "orbit://"]) {
    test(`a stamped Bear ${name} links to its ID with ${prefix}`, () => {
      const taskID = "AbCdEfGhIjKlMnOpQrStUv" as TaskID;
      const footer = "\n\n<!-- {BearID:ABC-123} -->";
      const original = interpret(markdown + footer);
      const source = interpret(`${markdown} [☉](${prefix}${taskID})${footer}`);
      const item = source.items[0];
      expect(source.url).toBe("bear://x-callback-url/open-note?id=ABC-123");
      expect(item.url).toBe(`${source.url}&search=${taskID}`);
      expect(item.spec).toEqual(original.items[0].spec);
      expect(item.identifier).toBe(taskID);

      const input = JSON.parse(JSON.stringify({ sources: [source] }));
      expect(
        createIngestibleValidator({ mutateWithDefaultValues: false }).validate(
          input,
        ),
      ).toEqual({ isValid: true, errors: null });
      // Reimporting an already stamped task changes navigation, not its
      // identity, wording, observations, or schedule.
      const existing = {
        spec: item.spec,
        provenance: {
          identifier: source.identifier,
          title: source.title,
          url: source.url,
        },
        metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: taskID },
        isDeleted: false,
      };
      expect(
        ingestSources(input.sources, new Map([[taskID, existing]])),
      ).toEqual([
        {
          kind: "updateTaskProvenance",
          mutationID: expect.any(String),
          taskID,
          provenance: { ...existing.provenance, url: item.url },
        },
      ]);
    });
  }
}

test("a badge without Bear source metadata does not invent a source URL", () => {
  const source = interpret(
    "Q. Front\nA. Back [☉](orbit://task/AbCdEfGhIjKlMnOpQrStUv)",
  );
  expect(source.url).toBeUndefined();
  expect(source.items[0].url).toBeUndefined();
});

test("a Markdown badge survives the JSON boundary and targets an existing hash-imported task", () => {
  const taskID = "AbCdEfGhIjKlMnOpQrStUv" as TaskID;
  const original = interpret("# Source\n\nQ. Front\nA. Back");
  const existing = {
    spec: original.items[0].spec,
    provenance: { identifier: original.identifier, title: original.title },
    metadata: {
      [INGEST_ITEM_IDENTIFIER_KEY]: original.items[0].identifier,
    },
    isDeleted: false,
  };
  const tasks = new Map([[taskID, existing]]);
  const incoming = interpretMarkdownFiles([
    {
      name: "Source.md",
      path: "/notes/Source.md",
      content: `# Source\n\nQ. Revised front\nA. Revised back [☉](orbit://task/${taskID})`,
    },
  ]);
  const serialized = JSON.parse(JSON.stringify(incoming));
  expect(
    createIngestibleValidator({ mutateWithDefaultValues: false }).validate(
      serialized,
    ),
  ).toEqual({ isValid: true, errors: null });
  expect(ingestSources(serialized.sources, tasks)).toMatchObject([
    { kind: "updateTaskSpec", taskID, spec: incoming.sources[0].items[0].spec },
    {
      kind: "mergeTaskMetadata",
      taskID,
      metadata: { [INGEST_ITEM_IDENTIFIER_KEY]: taskID },
    },
  ]);
  expect(existing.spec).toEqual(original.items[0].spec);
  expect(existing.metadata[INGEST_ITEM_IDENTIFIER_KEY]).toBe(
    original.items[0].identifier,
  );
});
