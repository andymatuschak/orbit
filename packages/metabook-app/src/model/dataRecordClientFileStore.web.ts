import {
  AttachmentMimeType,
  getAttachmentTypeForAttachmentMimeType,
  getFileExtensionForAttachmentMimeType,
} from "metabook-core";
import { DataRecordClientFileStore } from "./dataRecordManager";

let _cache: Cache | null = null;
async function getCache(): Promise<Cache> {
  if (!_cache) {
    _cache = await window.caches.open("attachments");
  }
  return _cache;
}

const dataRecordClientFileStore: DataRecordClientFileStore = {
  async storeFileFromURL(url: string) {
    const request = new Request(url);
    const response = await fetch(request);
    const contentType = response.headers.get("Content-Type");
    const attachmentExtension =
      contentType && getFileExtensionForAttachmentMimeType(contentType);
    const responseIsOK = response.status >= 200 && response.status < 300;
    if (responseIsOK && attachmentExtension) {
      const cache = await getCache();
      cache.put(request, response);
      return {
        url,
        type: getAttachmentTypeForAttachmentMimeType(
          contentType as AttachmentMimeType,
        ),
      };
    } else {
      if (!responseIsOK) {
        throw new Error(
          `Request for ${url} returned invalid status ${response.status}`,
        );
      } else {
        throw new Error(
          `Request for ${url} returned unsupported content type ${contentType}`,
        );
      }
    }
  },

  async storedURLExists(url: string) {
    const cache = await getCache();
    const response = await cache.match(url);
    return !!response;
  },
};

export default dataRecordClientFileStore;
