import { readAnkiCollection } from "./ankiCollection";

test("read collection", async () => {
  await readAnkiCollection("/Users/andym/Desktop/test.colpkg");
});
