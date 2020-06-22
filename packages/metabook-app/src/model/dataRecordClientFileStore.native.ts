import * as FileSystem from "expo-file-system";
import {
  AttachmentID,
  AttachmentMimeType,
  AttachmentURLReference,
  getAttachmentTypeForAttachmentMimeType,
  getFileExtensionForAttachmentMimeType,
} from "metabook-core";
import { DataRecordClientFileStore } from "./dataRecordManager";

function getAttachmentStorageBaseURL(): string {
  const cacheDirectoryURI = FileSystem.documentDirectory;
  if (cacheDirectoryURI === null) {
    throw new Error("Unknown document directory");
  }
  return cacheDirectoryURI + "attachments";
}

let hasEnsuredAttachmentDirectoryExists = false;
async function ensureAttachmentDirectoryExists(): Promise<void> {
  if (!hasEnsuredAttachmentDirectoryExists) {
    const info = await FileSystem.getInfoAsync(getAttachmentStorageBaseURL());
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(getAttachmentStorageBaseURL(), {
        intermediates: true,
      });
    }
    hasEnsuredAttachmentDirectoryExists = true;
  }
}

async function storeFileFromURL(
  url: string,
  attachmentID: AttachmentID,
): Promise<AttachmentURLReference> {
  await ensureAttachmentDirectoryExists();

  // React Native requires that images have their "correct" file extensions, but we can't know ahead of time what this attachment's file type is.
  // So we do a two-step dance: first download it, then add the correct extension based on the contentType header.
  const cachedAttachmentURL = `${getAttachmentStorageBaseURL()}/${attachmentID}`;
  const result = await FileSystem.downloadAsync(url, cachedAttachmentURL);

  // Check the result.
  const contentType = result.headers["Content-Type"];
  const attachmentExtension =
    contentType && getFileExtensionForAttachmentMimeType(contentType);
  const responseIsOK = result.status >= 200 && result.status < 300;
  if (responseIsOK && attachmentExtension) {
    await FileSystem.moveAsync({
      from: cachedAttachmentURL,
      to: `${cachedAttachmentURL}.${attachmentExtension}`,
    });
  } else {
    await FileSystem.deleteAsync(cachedAttachmentURL);
    if (!responseIsOK) {
      throw new Error(
        `Request for ${url} returned invalid status ${result.status}`,
      );
    } else {
      throw new Error(
        `Request for ${url} returned unsupported content type ${contentType}`,
      );
    }
  }

  console.log(`Wrote file to cache: ${cachedAttachmentURL}`);
  return {
    url: cachedAttachmentURL,
    type: getAttachmentTypeForAttachmentMimeType(
      contentType as AttachmentMimeType,
    ),
  };
}

async function storedURLExists(url: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(url);
  return info.exists;
}

const dataRecordClientFileStore: DataRecordClientFileStore = {
  storeFileFromURL,
  storedURLExists,
};

export default dataRecordClientFileStore;
