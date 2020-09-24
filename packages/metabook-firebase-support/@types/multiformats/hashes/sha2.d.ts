declare module "multiformats/hashes/sha2" {
  type HashFunction = (data: Uint8Array) => Promise<Uint8Array>;
  interface HashConfiguration {
    name: string;
    encode: HashFunction;
    code: number;
  }
  const hashes: HashConfiguration[];
  export default hashes;
}
