/// <reference lib="dom">
declare module "fastestsmallesttextencoderdecoder" {
  export const TextEncoder: TextEncoder;
  export const TextDecoder: TextDecoder;
  export const encode: typeof TextEncoder.encode;
  export const decode: typeof TextDecoder.decode;
}
