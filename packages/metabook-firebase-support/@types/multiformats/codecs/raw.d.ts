declare module "multiformats/codecs/raw" {
  interface CodecConfiguration {
    name: string;
    encode: (data: Uint8Array) => Uint8Array;
    decode: (data: Uint8Array) => Uint8Array;
    code: number;
  }
  const raw: CodecConfiguration;
  export default raw;
}
