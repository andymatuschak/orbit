declare module "@ipld/dag-json" {
  interface Codec {
    encode(input: unknown): Uint8Array;
    decode(input: Uint8Array): string;
    code: number;
    name: string;
  }

  function dagJSON(multiformats: unknown): Codec;
  export = dagJSON;
}
