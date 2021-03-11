// TODO: remove this workaround once https://github.com/multiformats/js-multiformats/issues/48 is fixed

declare module "multiformats/cid" {
  export default class CID {
    static parse(input: string): CID;
    static create(version: number, code: number, hash: any): CID;

    toString(baseEncoder: any): string;
    code: number;
    multihash: any;
  }
}

declare module "multiformats/bases/base58" {
  export const base58btc: any;
}

declare module "multiformats/bases/base32" {
  export const base32: any;
}

declare module "multiformats/hashes/sha2" {
  export const sha256: any;
}

declare module "multiformats/hashes/digest" {
  export function create(code: number, buffer: any): any;
  export type MultihashDigest = any;
}

declare module "multiformats/codecs/raw" {
  const x: any;
  export default x;
}
