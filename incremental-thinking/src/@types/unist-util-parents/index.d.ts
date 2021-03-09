declare module "unist-util-parents" {
  import unist from "unist";

  function Parents(node: unist.Node): Parents.NodeWithParent;

  namespace Parents {
    export type NodeWithParent = unist.Node & { parent: ParentNodeWithParent | null, node: unist.Node };
    export type ParentNodeWithParent = unist.Parent & { parent: ParentNodeWithParent | null, node: unist.Parent };
  }

  export = Parents;
}
