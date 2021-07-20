/*
Implements an attachment store by writing files to a folder on disk.

This implementation is for React Native clients.
 */
import { getFileExtensionForAttachmentMimeType } from "@withorbit/core";
import { AttachmentReference } from "@withorbit/core2";
import {
  AttachmentDownloadError,
  AttachmentStore,
} from "@withorbit/store-shared";
import path from "path";
import { FileSystem } from "react-native-unimodules";
import { pathToFileURL } from "url";
import { getPathForAttachment } from "./util/getPathForAttachment";

export class AttachmentStoreFS implements AttachmentStore {
  private readonly _basePath: string;

  // basePath must be a path to a folder which already exists.
  constructor(basePath: string) {
    this._basePath = path.normalize(basePath);
  }

  async storeAttachmentFromURL(
    sourceURL: string,
    attachmentReference: AttachmentReference,
  ): Promise<void> {
    const tempDownloadURL = FileSystem.cacheDirectory + Date.now().toString();
    const result = await FileSystem.downloadAsync(sourceURL, tempDownloadURL);
    if (result.status >= 200 && result.status < 300) {
      const attachmentPath = path.join(
        this._basePath,
        `${attachmentReference.id}.${getFileExtensionForAttachmentMimeType(
          attachmentReference.mimeType,
        )}`,
      );

      await FileSystem.moveAsync({ from: tempDownloadURL, to: attachmentPath });
    } else {
      await FileSystem.deleteAsync(tempDownloadURL);
      throw new AttachmentDownloadError({ statusCode: result.status });
    }
  }

  // If the attachment has already been stored, resolves to its local URL; otherwise resolves to null.
  async getURLForStoredAttachment(
    attachmentReference: AttachmentReference,
  ): Promise<string | null> {
    const attachmentURL = pathToFileURL(
      getPathForAttachment(this._basePath, attachmentReference),
    ).href;
    const exists = await FileSystem.getInfoAsync(attachmentURL)
      .then(({ exists }) => exists)
      .catch(() => false);
    return exists ? attachmentURL : null;
  }
}
