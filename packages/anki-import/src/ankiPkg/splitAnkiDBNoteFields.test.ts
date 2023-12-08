import splitAnkiDBNoteFields from "./splitAnkiDBNoteFields.js";

test("parse Anki DB field with two entries", () => {
  // String literal here copied from my database, includes the 0x1f character code.
  expect(splitAnkiDBNoteFields("1 lb in kg0.45 kg")).toMatchObject([
    "1 lb in kg",
    "0.45 kg",
  ]);
});

test("parse Anki DB field with one entry", () => {
  expect(splitAnkiDBNoteFields("test")).toMatchObject(["test"]);
});
