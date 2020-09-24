interface BaseConfiguration {
  name: string;
  prefix: string;
  encode: (data: Uint8Array) => string;
  decode: (encoded: string) => Uint8Array;
}

declare module "multiformats/bases/base58" {
  const base58: BaseConfiguration[];
  export default base58;
}

declare module "multiformats/bases/base32" {
  const base32: BaseConfiguration[];
  export default base32;
}
