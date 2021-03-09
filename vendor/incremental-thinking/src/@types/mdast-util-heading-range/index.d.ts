declare module "mdast-util-heading-range" {
  import unist from "unist";
  import mdast from "mdast";

  function headingRange(
    tree: unist.Node,
    test:
      | HeadingRange.TestFunction
      | string
      | RegExp
      | {
          test: HeadingRange.TestFunction | string | RegExp;
          ignoreFinalDefinitions?: boolean;
        },
    onRun: (
      start: mdast.Heading,
      nodes: unist.Node[],
      end: unist.Node | null,
      scope: { parent: unist.Parent; start: number; end: number | null }
    ) => unist.Node[]
  ): unist.Node;
  namespace HeadingRange {
    type TestFunction = (value: string, node: mdast.Heading) => boolean;
  }

  export = headingRange;
}
