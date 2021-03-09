declare module "unist-util-map" {
import unist from "unist";

    interface Map {
    (
      tree: unist.Node,
      iteratee: (
        node: unist.Node,
        index: number | null,
        parent: unist.Node | null
      ) => unist.Node
    ): unist.Node;
  }

  const unistUtilMap: Map;
  export = unistUtilMap;
}
