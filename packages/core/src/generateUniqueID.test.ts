import {
  encodeUUIDBytesToWebSafeBase64ID,
  generateUniqueID,
} from "./generateUniqueID.js";

test("matches expected pattern", () => {
  expect(generateUniqueID().match(/^[0-9a-zA-Z_\-]{22}$/)).toBeTruthy();
});

test("different each time", () => {
  expect(generateUniqueID()).not.toEqual(generateUniqueID());
});

test("stable output", () => {
  const bytes = Uint8Array.from([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  ]);
  const id = encodeUUIDBytesToWebSafeBase64ID(bytes);
  expect(id).toMatchInlineSnapshot(`"AAECAwQFBgcICQoLDA0ODw"`);
});
