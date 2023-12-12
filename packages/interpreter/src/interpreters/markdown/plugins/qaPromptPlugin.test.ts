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
        qaPromptNode.question.position!.start.offset,
        qaPromptNode.question.position!.end.offset,
      ),
    ).toEqual("A question prompt");
    expect(
      input.slice(
        qaPromptNode.answer.position!.start.offset,
        qaPromptNode.answer.position!.end.offset,
      ),
    ).toEqual("An answer prompt");
    expect(qaPromptNode.question.position!.start.column).toEqual(4); // n.b. column is 1-indexed!
    expect(qaPromptNode.answer.position!.start.column).toEqual(4);

    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.question] })
        .trimEnd(),
    ).toEqual("A question prompt");
    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.answer] })
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
        qaPromptNode.question.position!.start.offset,
        qaPromptNode.question.position!.end.offset,
      ),
    ).toEqual("A question prompt");
    expect(
      input.slice(
        qaPromptNode.answer.position!.start.offset,
        qaPromptNode.answer.position!.end.offset,
      ),
    ).toEqual("An answer prompt");
    expect(qaPromptNode.question.position!.start.column).toEqual(4); // n.b. column is 1-indexed!
    expect(qaPromptNode.question.position!.start.line).toEqual(3);
    expect(qaPromptNode.answer.position!.start.column).toEqual(4);
    expect(qaPromptNode.answer.position!.start.line).toEqual(4);

    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.question] })
        .trimEnd(),
    ).toEqual("A question prompt");
    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.answer] })
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
        qaPromptNode.question.position!.start.offset,
        qaPromptNode.question.position!.end.offset,
      ),
    ).toEqual("A question *prompt*");
    expect(
      input.slice(
        qaPromptNode.answer.position!.start.offset,
        qaPromptNode.answer.position!.end.offset,
      ),
    ).toEqual("An answer prompt");
    expect(qaPromptNode.question.position!.start.column).toEqual(4); // n.b. column is 1-indexed!
    expect(qaPromptNode.question.position!.start.line).toEqual(3);
    expect(qaPromptNode.answer.position!.start.column).toEqual(4);
    expect(qaPromptNode.answer.position!.start.line).toEqual(4);

    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.question] })
        .trimEnd(),
    ).toEqual("A question *prompt*");
    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.answer] })
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
        qaPromptNode.question.position!.start.offset,
        qaPromptNode.question.position!.end.offset,
      ),
    ).toEqual("A question\nprompt");
    expect(
      input.slice(
        qaPromptNode.answer.position!.start.offset,
        qaPromptNode.answer.position!.end.offset,
      ),
    ).toEqual("An answer\nprompt");
    expect(qaPromptNode.question.position!.start.column).toEqual(4); // n.b. column is 1-indexed!
    expect(qaPromptNode.question.position!.start.line).toEqual(3);
    expect(qaPromptNode.answer.position!.start.column).toEqual(4);
    expect(qaPromptNode.answer.position!.start.line).toEqual(5);

    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.question] })
        .trimEnd(),
    ).toEqual("A question\nprompt");
    expect(
      processor
        .stringify({ type: "root", children: [qaPromptNode.answer] })
        .trimEnd(),
    ).toEqual("An answer\nprompt");
  });

  test("single line", () => {
    const input = `Some other text
    
Q. A question *prompt*. A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeUndefined();
  });

  test("fake QA prompt", () => {
    const input = `Some other text
    
A. An answer prompt

Some more text`;
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
});
