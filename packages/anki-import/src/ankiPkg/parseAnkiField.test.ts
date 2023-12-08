import parseAnkiField from "./parseAnkiField.js";

test("translates divs into paragraphs", () => {
  expect(
    parseAnkiField("<div>First</div><div>Second</div>").contentsMarkdown,
  ).toEqual("First\n\nSecond");
});

test("translates standard text markup", () => {
  expect(
    parseAnkiField("<em>Test</em> <strong>foo</strong>").contentsMarkdown,
  ).toEqual("*Test* **foo**");
});

test("extracts image references", () => {
  expect(
    parseAnkiField(`With image reference <img src="test.png" />`),
  ).toMatchObject({
    contentsMarkdown: "With image reference",
    attachmentReferences: [
      {
        type: "image",
        name: "test.png",
      },
    ],
  });
});

test("extracts sound references", () => {
  expect(parseAnkiField(`With sound reference [sound:test.m4a]`)).toMatchObject(
    {
      contentsMarkdown: "With sound reference",
      attachmentReferences: [
        {
          type: "sound",
          name: "test.m4a",
        },
      ],
    },
  );
});

test("converts cloze deletions", () => {
  expect(
    parseAnkiField("Garlic confit: {{c1::6 hours}} at {{c2::185}}°F")
      .contentsMarkdown,
  ).toBe("Garlic confit: {6 hours} at {185}°F");
});
