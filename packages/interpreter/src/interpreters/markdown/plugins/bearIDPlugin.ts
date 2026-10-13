import mdast from "mdast";
import * as unified from "unified";
import unist from "unist";
import { map as unistUtilMap } from "unist-util-map";

export const bearIDNodeType = "bearID";

export interface BearIDNode extends unist.Node {
  type: typeof bearIDNodeType;
  bearID: string;
}

const bearIDRegexp = /<!-- {BearID:([0-9A-F\-]+?)} -->/;

function reifyBearIDNodes(root: unist.Node): unist.Node {
  return unistUtilMap(root, (visitee) => {
    if (visitee.type === "html") {
      const htmlNode = visitee as mdast.HTML;
      const match = htmlNode.value.match(bearIDRegexp);
      if (match) {
        const bearIDNode: BearIDNode = {
          type: bearIDNodeType,
          bearID: match[1],
        };
        return bearIDNode;
      }
    }
    return visitee;
  });
}

export default function bearIDPlugin(this: unified.Processor) {
  const data = this.data();
  if (!data.toMarkdownExtensions) {
    data.toMarkdownExtensions = [];
  }
  (data.toMarkdownExtensions as any[]).push({
    handlers: {
      [bearIDNodeType]: (node: BearIDNode) =>
        `<!-- {BearID:${node.bearID}} -->`,
    },
  });
  return reifyBearIDNodes;
}
