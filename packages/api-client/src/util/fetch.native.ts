import { API } from "@withorbit/api";
import {
  fromByteArray as byteArrayToBase64,
  toByteArray as base64ToByteArray,
} from "base64-js";

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
  // HACK: Sad, slow workaround for React Native's poor binary data support: Blob.arrayBuffer() is not implemented. https://github.com/facebook/react-native/pull/30769
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = (reader.result as string).split(",")[1];
      if (base64Data) {
        resolve(base64ToByteArray(base64Data));
      } else {
        reject(new Error(`Couldn't decode blob`));
      }
    };
    const blob = blobLike as unknown as Blob;
    reader.readAsDataURL(blob);
  });
}

export function createBlobFromBuffer<T>(
  buffer: Uint8Array,
  mimeType: T,
): API.BlobLike<T> {
  // HACK: Working around RN's lack of support for binary buffers.
  // Here relying on some RN internals--see FormData.js and RCTNetworking.mm
  return {
    type: mimeType,
    size: buffer.length,
    name: "unknown.txt",
    base64: byteArrayToBase64(buffer),
  } as API.BlobLike<T>;
}
