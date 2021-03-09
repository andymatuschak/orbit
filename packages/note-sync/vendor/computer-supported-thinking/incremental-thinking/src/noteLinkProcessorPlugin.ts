import remarkStringify from "remark-stringify";
import remarkWikiLink from "remark-wiki-link";
import unified from "unified";
import unist from "unist";
import unistUtilMap from "unist-util-map";

export const noteLinkNodeType = "noteLinkNode";
export interface NoteLinkNode extends unist.Node {
  type: typeof noteLinkNodeType;
  targetNoteName: string;
  targetNoteDisplayName: string;
}

function transformWikiLinksIntoNoteLinks(node: unist.Node): unist.Node {
  return unistUtilMap(node, visitee => {
    if (visitee.type === "wikiLink") {
      const wikiLinkNode = (visitee as unknown) as remarkWikiLink.RemarkWikiLinkNode;
      return {
        type: "noteLinkNode",
        targetNoteName: wikiLinkNode.value,
        targetNoteDisplayName: wikiLinkNode.data.alias
      } as NoteLinkNode;
    }
    else {
      return visitee;
    }
  });
}

function allLinksHaveTitles(this: unified.Processor): void {
  const Compiler = this.Compiler;
  const visitors = (Compiler.prototype as remarkStringify.Compiler).visitors;
  const original = visitors.link;

  visitors.link = function(linkNode: unist.Node) {
    return original.bind(this)({
      ...linkNode,
      title: linkNode.title || ""
    });
  };
}

export default function noteLinkPlugin(this: unified.Processor) {
  // A bit of a hack. remark-wiki-link is a parser; this plugin adds a transformer on the end. A client could reasonably expect to be able to simply run `parse` and get a result with the node links. Instead, they have to run `run`, since the transformers also need to be executed. Should fix that. TODO
  remarkWikiLink.apply(this);

  this.Compiler.prototype.visitors.noteLinkNode = (node: NoteLinkNode) => node.targetNoteName === node.targetNoteDisplayName
    ? `[[${node.targetNoteName}]]`
    : `[[${node.targetNoteName}:${node.targetNoteDisplayName}]]`;
  return transformWikiLinksIntoNoteLinks;
}
