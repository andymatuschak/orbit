declare module "multihashes" {
  export function encode(data: Buffer, type: string): Buffer;
  export function decode(
    data: Buffer,
  ): { code: number; name: string; length: number; digest: Buffer };
  export function toB58String(buffer: Buffer): string;
  export function fromB58String(buffer: string): Buffer;
}
