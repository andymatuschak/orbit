import mdast from "mdast";
import { processor } from "../markdown.js";
import { getStableBearID } from "./getStableBearID.js";

describe("finding note IDs", () => {
  describe("bear note IDs", () => {
    test("extracts bear note ID", () => {
      const testBearID =
        "860466DE-8254-47C1-AA71-BA9C0CE18FA3-402-00002ED1CDC440DA";
      const input = `# Test node

<!-- {BearID:${testBearID}} -->`;

      const tree = processor.runSync(processor.parse(input)) as mdast.Root;
      const noteID = getStableBearID(tree);
      expect(noteID).toBeTruthy();
      expect(noteID!.id).toEqual(testBearID);
      expect(noteID!.openURL).toEqual(
        "bear://x-callback-url/open-note?id=860466DE-8254-47C1-AA71-BA9C0CE18FA3-402-00002ED1CDC440DA",
      );
    });
  });
});
