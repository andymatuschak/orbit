declare module "multiformats" {
  interface Varint {
    decode(input: Uint8Array): [number, number];
    encode(input: number): Uint8Array;
  }

  interface MultihashImplementation {
    name: string;
    code: number;
    encode(value: Uint8Array): Uint8Array;
  }

  interface Multihash {
    name: string;
    code: number;
    decode(
      value: Uint8Array,
    ): { name: string; code: number; length: number; digest: Uint8Array };
    encode(bytes: Uint8Array, base: string): Uint8Array;
    hash(bytes: Uint8Array, key: string): Promise<Uint8Array>;
    has(id: number | string): boolean;
    get(id: number | string): boolean;
    add(codec: MultihashImplementation | MultihashImplementation[]): void;
    validate(hash: Uint8Array, bytes: Uint8Array): Promise<true>;
  }

  interface MultibaseImplementation {
    prefix: string;
    name: string;
    encode(input: Uint8Array): string;
    decode(input: string): Uint8Array;
  }

  interface Multibase {
    prefix: string;
    name: string;
    add: (codec: MultibaseImplementation | MultibaseImplementation[]) => void;
    get: (id: string) => MultibaseImplementation;
    has: (id: string) => boolean;
    encode: (bytes: Uint8Array, prefix?: string) => string;
    decode: MultibaseImplementation["decode"];
    encoding: (text: string) => MultibaseImplementation;
  }

  interface MulticodecImplementation<T> {
    name: string;
    code: number;
    encode(value: T): Uint8Array;
    decode(value: Uint8Array): T;
  }

  interface CIDUtils {
    from(value: CID | string | Uint8Array): CID;
    create(version: number, code: number, multihash: Uint8Array): CID;
    new (
      buffer: ArrayBuffer | Uint8Array,
      byteOffset?: number,
      byteLength?: number,
    ): CID;
  }

  export class CID {
    toV0(): CID;
    toV1(): CID;
    toString(multibaseName?: string): string;
    toJSON(): unknown;
    equals(other: CID): boolean;

    byteOffset: number;
    byteLength: number;
    version: number;
    code: number;
    multihash: Uint8Array;
  }

  interface Multiformats {
    varint: Varint;
    parse(buffer: Uint8Array): [MultihashImplementation, number];

    add(value: MultihashImplementation | MultihashImplementation[]): void;
    get(input: string | number | Uint8Array): MultihashImplementation;
    has: (id: string | number) => boolean;
    // encode: (value: Uint8Array) => Uint8Array;
    // decode: (value: Uint8Array) => Uint8Array;

    multicodec: {
      add<T>(
        value: MulticodecImplementation<T> | MulticodecImplementation<T>[],
      ): void;
      get(input: string | number | Uint8Array): MultihashImplementation;
      has(id: string | number): boolean;
      encode(value: unknown, id: string): Uint8Array;
      decode(value: unknown, id: string): Uint8Array;
    };

    multibase: Multibase;
    multihash: Multihash;
    CID: CIDUtils;
  }

  export function create(): Multiformats;
}
