declare module "multihashing" {
  interface Multihashing {
    (data: Buffer | string, type: Multihashing.MultihashingType): Buffer;
    digest(data: Buffer | string, type: Multihashing.MultihashingType): Buffer;
    createHash(
      type: Multihashing.MultihashingType,
    ): (data: Buffer | string) => Buffer;
  }

  namespace Multihashing {
    type MultihashingType = "sha2-256" | "sha2-512" | "sha1";
  }

  const multihashing: Multihashing;
  export = multihashing;
}
