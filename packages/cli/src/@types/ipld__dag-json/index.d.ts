declare module "@ipld/dag-json" {
  export function encode(input: unknown): Uint8Array;
  export function decode(input: Uint8Array): unknown;
  export const name: string;
  export const code: number;
}
