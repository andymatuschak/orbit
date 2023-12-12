import { API } from "@withorbit/api";

export async function getBytesFromBlobLike(
  blobLike: API.BlobLike<any>,
): Promise<Uint8Array> {
  if (!blobLike.arrayBuffer) {
    throw new Error("Unexpectedly missing implementation of Blob.arrayBuffer");
  }
  return new Uint8Array(await blobLike.arrayBuffer());
}

export function createBlobFromBuffer(
  buffer: Uint8Array,
  mimeType: string,
): Blob {
  return new Blob([buffer], { type: mimeType });
}
