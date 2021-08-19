import { generateUniqueID } from "./generateUniqueID";

test("matches expected pattern", () => {
  expect(generateUniqueID().match(/^[0-9a-zA-Z_\-]{22}$/)).toBeTruthy();
});
