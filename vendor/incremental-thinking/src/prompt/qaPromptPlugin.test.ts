import { select, selectAll } from "unist-util-select";
import { markdownProcessor } from "../processor";
import { QAPromptNode, qaPromptNodeType } from "./index";
import qaPromptPlugin from "./qaPromptPlugin";

const processor = markdownProcessor.use(qaPromptPlugin);

describe("extracts QA prompts", () => {
  test("two paragraphs", () => {
    const input = `Some other text
    
Q. A question prompt

A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeTruthy();

    expect(processor.stringify(qaPromptNode.question).trimRight()).toEqual(
      "A question prompt"
    );
    expect(processor.stringify(qaPromptNode.answer).trimRight()).toEqual(
      "An answer prompt"
    );
  });

  test("single paragraph", () => {
    const input = `Some other text
    
Q. A question *prompt*
A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeTruthy();

    expect(processor.stringify(qaPromptNode.question).trimRight()).toEqual(
      "A question *prompt*"
    );
    expect(processor.stringify(qaPromptNode.answer).trimRight()).toEqual(
      "An answer prompt"
    );
  });

  test("single line", () => {
    const input = `Some other text
    
Q. A question *prompt*. A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeNull();
  });

  test("fake QA prompt", () => {
    const input = `Some other text
    
A. An answer prompt

Some more text`;
    const ast = processor.runSync(processor.parse(input));
    const qaPromptNode = select(qaPromptNodeType, ast)! as QAPromptNode;
    expect(qaPromptNode).toBeNull();
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
