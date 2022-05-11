import mdast from "mdast";
import { select } from "unist-util-select";
import backlinksPlugin, {
  BacklinksNode,
  backlinksNodeType,
} from "./backlinksPlugin";
import noteLinkProcessorPlugin from "./noteLinkProcessorPlugin";
import { markdownProcessor } from "../markdown";

const processor = markdownProcessor()
  .use(noteLinkProcessorPlugin)
  .use(backlinksPlugin);

function getBacklinksNode(input: string): {
  backlinksNode: BacklinksNode | null;
  ast: mdast.Root;
} {
  const ast = processor.runSync(processor.parse(input)) as mdast.Root;
  return {
    backlinksNode: select(backlinksNodeType, ast) as BacklinksNode | null,
    ast,
  };
}

describe("parses backlink blocks", () => {
  test("no excerpts", () => {
    const input = `# Note title
    
A paragraph

## Backlinks

* [[Source node]]
`;
    const { backlinksNode } = getBacklinksNode(input);
    expect(backlinksNode!.children).toHaveLength(1);
    const backlinkSourceNode = backlinksNode!.children[0];
    expect(backlinkSourceNode.sourceNodeLink.targetNoteName).toEqual(
      "Source node",
    );
    expect(backlinkSourceNode.children).toHaveLength(0);
  });

  test("with excerpts", () => {
    const input = `# Note title
    
A paragraph

## Backlinks

* [[Source node]]
\t* This is an excerpt from the source node.
\t* Another excerpt
* [[Another source node]]

## Another section
`;
    const { backlinksNode, ast } = getBacklinksNode(input);
    expect(backlinksNode!.children).toHaveLength(2);
    const firstSourceNode = backlinksNode!.children[0];
    expect(firstSourceNode.sourceNodeLink.targetNoteName).toEqual(
      "Source node",
    );
    expect(firstSourceNode.children).toHaveLength(2);
    expect(
      processor.stringify(firstSourceNode.children[0]).trimRight(),
    ).toEqual("This is an excerpt from the source node.");
    expect(
      processor.stringify(firstSourceNode.children[1]).trimRight(),
    ).toEqual("Another excerpt");
    expect(backlinksNode!.children[1].sourceNodeLink.targetNoteName).toEqual(
      "Another source node",
    );

    const subsequentHeadingNode = select(
      "heading[depth=2] *[value='Another section']",
      ast,
    );
    expect(subsequentHeadingNode).toBeTruthy();
  });

  test("with tag comment", () => {
    const input = `# Note title

## Backlinks

* [[Source node]]

<!-- #tag -->
`;
    const { backlinksNode, ast } = getBacklinksNode(input);
    expect(backlinksNode!.children).toHaveLength(1);
    const backlinkSourceNode = backlinksNode!.children[0];
    expect(backlinkSourceNode.sourceNodeLink.targetNoteName).toEqual(
      "Source node",
    );
    expect(backlinkSourceNode.children).toHaveLength(0);

    const subsequentHeadingNode = select("html", ast);
    expect(subsequentHeadingNode).toBeTruthy();
  });
});
