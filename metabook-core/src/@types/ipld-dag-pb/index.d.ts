/// <reference types="node" />
declare module "ipld-dag-pb" {
  import CID from "cids";

  export class DAGNode {
    constructor(
      data: Buffer | string | undefined,
      links?: DAGLink[],
      serializedSize?: number,
    );
    toJSON(): any;
    toString(): string;
    toDAGLink(): DAGLink;
    addLink(link: DAGLink): DAGLink;
    rmLink(link: DAGLink): void;
    serialize(): Buffer;

    readonly Data: Buffer;
    readonly Links: DAGLink[];
    readonly size: number;
  }

  export class DAGLink {
    constructor(
      name: string | null | undefined,
      size: number,
      cid: string | Buffer | CID,
    );

    toString(): string;
    toJSON(): any;

    readonly Name: string;
    readonly Tsize: number;
    readonly Hash: CID;
  }

  // TODO: util, resolver
}
