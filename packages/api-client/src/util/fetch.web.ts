// We assume modern browsers.
import { API } from "@withorbit/api";

const _Blob = Blob;
const _fetch = fetch;
const _Request = Request;
const _Response = Response;
const _FormData = FormData;
export {
  _fetch as fetch,
  _Blob as Blob,
  _Request as Request,
  _Response as Response,
  _FormData as FormData,
};

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
