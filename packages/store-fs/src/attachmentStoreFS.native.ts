/*
Implements an attachment store by writing files to a folder on disk.

This implementation is for React Native clients.
 */
import {
  AttachmentID,
  AttachmentMIMEType,
  getFileExtensionForAttachmentMIMEType,
} from "@withorbit/core2";
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
  private readonly _getAttachmentType: (
    id: AttachmentID,
  ) => Promise<AttachmentMIMEType | null>;

  // basePath must be a path to a folder which already exists.
  constructor(
    basePath: string,
    getAttachmentType: (id: AttachmentID) => Promise<AttachmentMIMEType | null>,
  ) {
    this._basePath = path.normalize(basePath);
    this._getAttachmentType = getAttachmentType;
  }

  async storeAttachmentFromURL(
    sourceURL: string,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    const tempDownloadURL = FileSystem.cacheDirectory + Date.now().toString();
    const result = await FileSystem.downloadAsync(sourceURL, tempDownloadURL);
    if (result.status >= 200 && result.status < 300) {
      const attachmentPath = path.join(
        this._basePath,
        `${id}.${getFileExtensionForAttachmentMIMEType(type)}`,
      );

      await FileSystem.moveAsync({ from: tempDownloadURL, to: attachmentPath });
    } else {
      await FileSystem.deleteAsync(tempDownloadURL);
      throw new AttachmentDownloadError({ statusCode: result.status });
    }
  }

  // If the attachment has already been stored, resolves to its local URL; otherwise resolves to null.
  async getURLForStoredAttachment(id: AttachmentID): Promise<string | null> {
    const type = await this._getAttachmentType(id);
    if (!type) {
      return null;
    }

    const attachmentURL = pathToFileURL(
      getPathForAttachment(this._basePath, id, type),
    ).href;
    const exists = await FileSystem.getInfoAsync(attachmentURL)
      .then(({ exists }) => exists)
      .catch(() => false);
    return exists ? attachmentURL : null;
  }
}
