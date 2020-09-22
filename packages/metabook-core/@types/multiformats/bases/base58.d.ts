declare module "multiformats/bases/base58" {
  interface BaseConfiguration {
    name: string;
    prefix: string;
    encode: (data: Uint8Array) => string;
    decode: (encoded: string) => Uint8Array;
  }
  const bases: BaseConfiguration[];
  export default bases;
}
