import { API } from "@withorbit/api";
import { getArrayBufferForBlob } from "react-native-blob-jsi-helper";

export async function getBytesFromBlobLike(
  blobLike: API.BlobLike<any>,
): Promise<Uint8Array> {
  return getArrayBufferForBlob(blobLike as Blob);
}

export function createBlobFromBuffer<T>(
  buffer: Uint8Array,
  mimeType: T,
): API.BlobLike<T> {
  return {
    type: mimeType,
    size: buffer.length,
    name: "unknown.txt",
    base64: btoa(String.fromCharCode.apply(null, Array.from(buffer))),
  } as API.BlobLike<T>;
}
