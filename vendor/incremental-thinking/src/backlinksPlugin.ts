import unist from "unist";
import mdast from "mdast";
import unified from "unified";
import heading from "mdast-util-heading-range";
import { select } from "unist-util-select";
import { NoteLinkNode, noteLinkNodeType } from "./noteLinkProcessorPlugin";

export const backlinksNodeType = "backlinksNode";

export interface BacklinksNode extends unist.Parent {
  type: typeof backlinksNodeType;
  children: BacklinkSourceNode[];
}

interface BacklinkSourceNode extends unist.Parent {
  type: "backlinkSourceNode";
  sourceNodeLink: NoteLinkNode;
  children: mdast.BlockContent[]; // excerpts
}

export default function backlinksPlugin(this: unified.Processor) {
  // TODO implement compiler
  return extractBacklinksBlock;
}

function getBacklinkSourceNodes(listNode: mdast.List): BacklinkSourceNode[] {
  return listNode.children.map((listItem) => {
    const sourceReference = listItem.children[0] as mdast.Paragraph;
    if (!sourceReference || sourceReference.type !== "paragraph") {
      throw new Error(
        `Unexpected backlinks source node: ${JSON.stringify(
          sourceReference
        )} ${JSON.stringify(listItem)}`
      );
    }
    const sourceNodeLink = select(
      noteLinkNodeType,
      sourceReference
    ) as NoteLinkNode;
    if (!sourceNodeLink) {
      throw new Error(
        `Couldn't find source node link ${JSON.stringify(
          sourceReference
        )} ${JSON.stringify(listItem)}`
      );
    }
    const excerptList = listItem.children[1] as mdast.List | undefined;
    if (excerptList && excerptList.type !== "list") {
      throw new Error(
        `Unexpected backlinks excerpt list node: ${JSON.stringify(
          excerptList
        )} ${JSON.stringify(listItem)}`
      );
    }
    let excerpts: mdast.BlockContent[];
    excerpts = excerptList
      ? excerptList.children.map((excerptListItem) => {
          if (excerptListItem.type !== "listItem") {
            throw new Error(
              `Unexpected backlinks excerpt list item: ${JSON.stringify(
                excerptListItem,
                null,
                "\t"
              )}
              
Inside backlinks node: ${JSON.stringify(listItem, null, "\t")}`
            );
          }
          if (excerptListItem.children.length > 1) {
            throw new Error(
              `Backlinks excerpt list item has too many children: ${JSON.stringify(
                excerptListItem,
                null,
                "\t"
              )}
              
Inside backlinks node: ${JSON.stringify(listItem, null, "\t")}`
            );
          }
          return excerptListItem.children[0] as mdast.BlockContent;
        })
      : [];

    const backlinkSourceNode: BacklinkSourceNode = {
      type: "backlinkSourceNode",
      sourceNodeLink,
      children: excerpts,
    };
    return backlinkSourceNode;
  });
}

function extractBacklinksBlock(node: unist.Node): unist.Node {
  heading(
    node,
    "Backlinks",
    (start, nodes, end, { parent, start: startIndex, end: endIndex }) => {
      const listNode = nodes[0] as mdast.List;
      const defaultResult = parent.children.slice(
        startIndex,
        endIndex ?? undefined
      );
      if (!listNode || listNode.type !== "list") {
        console.warn(`Unexpected node in backlinks node:`, listNode);
        return defaultResult;
      }

      const remainingNodes = nodes.slice(1);

      // TODO extract Bear comment node parser
      const nonCommentNodes = remainingNodes.filter(
        (n) => n.type !== "html" || !(n as mdast.HTML).value.startsWith("<!--")
      );
      if (nonCommentNodes.length > 0) {
        console.warn(
          `Unexpected nodes in backlinks node: ${JSON.stringify(
            nonCommentNodes,
            null,
            "\t"
          )}`
        );
        return defaultResult;
      }

      try {
        const sourceNodes = getBacklinkSourceNodes(listNode);
        return [
          {
            type: backlinksNodeType,
            children: sourceNodes,
          } as BacklinksNode,
          ...remainingNodes,
          ...(end ? [end] : []),
        ];
      } catch (error) {
        console.warn(error);
        return defaultResult;
      }
    }
  );
  return node;
}
