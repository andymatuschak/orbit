import { PromptSpecID } from "./identifiers";
import { decodePromptID, EncodedPromptID, encodePromptID } from "./promptID";

describe("decoding prompt IDs", () => {
  test("decoding basic prompt IDs", () => {
    expect(decodePromptID("foo" as EncodedPromptID)).toMatchObject({
      promptSpecID: "foo",
      childIndex: null,
    });
  });

  test("decoding indexed prompt IDs", () => {
    expect(decodePromptID("foo/3" as EncodedPromptID)).toMatchObject({
      promptSpecID: "foo",
      childIndex: 3,
    });
  });

  test("decoding invalid indexed prompt IDs", () => {
    expect(decodePromptID("foo/bar" as EncodedPromptID)).toBeNull();
  });

  test("decoding prompt IDs with too many segments", () => {
    expect(decodePromptID("foo/3/4" as EncodedPromptID)).toBeNull();
  });
});

describe("encoding prompt IDs", () => {
  test("encoding basic prompt IDs", () => {
    expect(
      encodePromptID({ promptSpecID: "foo" as PromptSpecID, childIndex: null }),
    ).toEqual("foo");
  });

  test("encoding indexed prompt IDs", () => {
    expect(
      encodePromptID({ promptSpecID: "foo" as PromptSpecID, childIndex: 3 }),
    ).toEqual("foo/3");
  });
});
