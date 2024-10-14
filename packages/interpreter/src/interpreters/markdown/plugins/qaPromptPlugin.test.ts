import { select, selectAll } from "unist-util-select";
import { markdownProcessor } from "../markdown.js";
import { QAPromptNode, qaPromptNodeType } from "../markdown.js";
import qaPromptPlugin from "./qaPromptPlugin.js";

const processor = markdownProcessor().use(qaPromptPlugin);

describe("extracts QA prompts", () => {
  test("two paragraphs", () => {
    const input = `Some other text
    
Q. A question prompt

A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      input.slice(
        qaPromptNode.question[0].position!.start.offset,
        qaPromptNode.question.at(-1)!.position!.end.offset,
      ),
    ).toEqual("Q. A question prompt");
    expect(
      input.slice(
        qaPromptNode.answer[0].position!.start.offset,
        qaPromptNode.answer.at(-1)!.position!.end.offset,
      ),
    ).toEqual("A. An answer prompt");

    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("A question prompt");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("An answer prompt");
  });

  test("single paragraph", () => {
    const input = `Some other text
    
Q. A question prompt
A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      input.slice(
        qaPromptNode.question[0].position!.start.offset,
        qaPromptNode.question.at(-1)!.position!.end.offset,
      ),
    ).toEqual("Q. A question prompt");
    expect(
      input.slice(
        qaPromptNode.answer[0].position!.start.offset,
        qaPromptNode.answer.at(-1)!.position!.end.offset,
      ),
    ).toEqual("A. An answer prompt");
    expect(qaPromptNode.question[0].position!.start.line).toEqual(3);
    expect(qaPromptNode.answer[0].position!.start.line).toEqual(4);

    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("A question prompt");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("An answer prompt");
  });

  test("single paragraph with node at end of line", () => {
    const input = `Some other text
    
Q. A question *prompt*
A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      input.slice(
        qaPromptNode.question[0].position!.start.offset,
        qaPromptNode.question.at(-1)!.position!.end.offset,
      ),
    ).toEqual("Q. A question *prompt*");
    expect(
      input.slice(
        qaPromptNode.answer[0].position!.start.offset,
        qaPromptNode.answer.at(-1)!.position!.end.offset,
      ),
    ).toEqual("A. An answer prompt");
    expect(qaPromptNode.question[0].position!.start.line).toEqual(3);
    expect(qaPromptNode.answer[0].position!.start.line).toEqual(4);

    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("A question *prompt*");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("An answer prompt");
  });

  test("single paragraph split across multiple lines", () => {
    const input = `Some other text
    
Q. A question
prompt
A. An answer
prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      input.slice(
        qaPromptNode.question[0].position!.start.offset,
        qaPromptNode.question.at(-1)!.position!.end.offset,
      ),
    ).toEqual("Q. A question\nprompt");
    expect(
      input.slice(
        qaPromptNode.answer[0].position!.start.offset,
        qaPromptNode.answer.at(-1)!.position!.end.offset,
      ),
    ).toEqual("A. An answer\nprompt");
    expect(qaPromptNode.question[0].position!.start.line).toEqual(3);
    expect(qaPromptNode.answer[0].position!.start.line).toEqual(5);

    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("A question\nprompt");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("An answer\nprompt");
  });

  test("multiblock question with answer in separate paragraph", () => {
    const input = `Q.
First paragraph.

Second paragraph.

A. An answer`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      input.slice(
        qaPromptNode.question[0].position!.start.offset,
        qaPromptNode.question.at(-1)!.position!.end.offset,
      ),
    ).toEqual("Q.\nFirst paragraph.\n\nSecond paragraph.");
    expect(
      input.slice(
        qaPromptNode.answer[0].position!.start.offset,
        qaPromptNode.answer.at(-1)!.position!.end.offset,
      ),
    ).toEqual("A. An answer");
    expect(qaPromptNode.question[0].position!.start.line).toEqual(1);
    expect(qaPromptNode.answer[0].position!.start.line).toEqual(6);

    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("First paragraph.\n\nSecond paragraph.");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("An answer");
  });

  test("multiblock question with answer in last block", () => {
    const input = `Q.
First paragraph.

Second paragraph.
A. An answer`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      input.slice(
        qaPromptNode.question[0].position!.start.offset,
        qaPromptNode.question.at(-1)!.position!.end.offset,
      ),
    ).toEqual("Q.\nFirst paragraph.\n\nSecond paragraph.");
    expect(
      input.slice(
        qaPromptNode.answer[0].position!.start.offset,
        qaPromptNode.answer.at(-1)!.position!.end.offset,
      ),
    ).toEqual("A. An answer");
    expect(qaPromptNode.question[0].position!.start.line).toEqual(1);
    expect(qaPromptNode.answer[0].position!.start.line).toEqual(5);

    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("First paragraph.\n\nSecond paragraph.");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("An answer");
  });

  test("multiblock answer", () => {
    const input = `Q. Foo
A.
First

Second`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      input.slice(
        qaPromptNode.question[0].position!.start.offset,
        qaPromptNode.question.at(-1)!.position!.end.offset,
      ),
    ).toEqual("Q. Foo");
    expect(
      input.slice(
        qaPromptNode.answer[0].position!.start.offset,
        qaPromptNode.answer.at(-1)!.position!.end.offset,
      ),
    ).toEqual("A.\nFirst\n\nSecond");
    expect(qaPromptNode.question[0].position!.start.line).toEqual(1);
    expect(qaPromptNode.answer[0].position!.start.line).toEqual(2);

    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("Foo");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("First\n\nSecond");
  });

  test("multiblock answer terminated in heading", () => {
    const input = `Q. Foo
A.
First

Second

# Heading`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("First\n\nSecond");
  });

  test("multiblock answer terminated in thematic break", () => {
    const input = `Q. Foo
A.
First

Second

---`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("First\n\nSecond");
  });

  test("multiblock q and a", () => {
    const input = `Q.
What's this?

![](testimage.png)

A.
Another multiblock

Answer

---

More irrelevant text.`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.question })
        .trimEnd(),
    ).toEqual("What's this?\n\n![](testimage.png)");
    expect(
      processor
        .stringify({ type: "root", children: qaPromptNode.answer })
        .trimEnd(),
    ).toEqual("Another multiblock\n\nAnswer");
  });

  test("single line shouldn't recognize", () => {
    const input = `Some other text
    
Q. A question *prompt*. A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeUndefined();
  });

  test("answer only shouldn't recognize", () => {
    const input = `Some other text
    
A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeUndefined();
  });

  test("single-line-style question block doesn't automatically extend", () => {
    const input = `Q. A question
    
With another paragraph
    
A. And then an answer block`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeUndefined();
  });

  test("multi-line question block is interrupted by a heading or ---", () => {
    const input = `Q.
A question
    
---
    
A. And then an answer block

Q.
Another question

# A heading

A. An answer`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeUndefined();
  });

  test("multiple prompts", () => {
    const input = `Some other text
    
Q. A question prompt

A. An answer

Q. Another question prompt

A. Another answer

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    expect(selectAll(qaPromptNodeType, ast)).toHaveLength(2);
  });

  test("questions terminate multiblock answers", () => {
    const input = `Q. Test
A.
Multi

Block answer

Q. Another q
A. Another a`;
    const ast = processor.runSync(processor.parse(input));
    const qs = selectAll(qaPromptNodeType, ast) as QAPromptNode[];
    expect(qs).toHaveLength(2);

    expect(
      processor.stringify({ type: "root", children: qs[0].answer }).trimEnd(),
    ).toEqual("Multi\n\nBlock answer");

    expect(
      processor.stringify({ type: "root", children: qs[1].question }).trimEnd(),
    ).toEqual("Another q");
  });

  test("questions terminate multiblock questions", () => {
    const input = `Q.
Test

Q. Another q

A. Another a
`;
    const ast = processor.runSync(processor.parse(input));
    const qs = selectAll(qaPromptNodeType, ast) as QAPromptNode[];
    expect(qs).toHaveLength(1);

    expect(
      processor.stringify({ type: "root", children: qs[0].question }).trimEnd(),
    ).toEqual("Another q");

    expect(
      processor.stringify({ type: "root", children: qs[0].answer }).trimEnd(),
    ).toEqual("Another a");
  });

  test("don't recognize answer prefix when it is on a later line of a subsequent paragraph block", () => {
    const input = `Q. Test
    
Another line.
A. Chouara`;
    const ast = processor.runSync(processor.parse(input));
    expect(selectAll(qaPromptNodeType, ast)).toHaveLength(0);
  });
});
