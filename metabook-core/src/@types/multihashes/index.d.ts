declare module "multihashes" {
  export function encode(data: Buffer, type: string): Buffer;
  export function decode(
    data: Buffer,
  ): { code: number; name: string; length: number; digest: Buffer };
}
