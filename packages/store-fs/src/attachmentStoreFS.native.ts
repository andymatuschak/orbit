/*
Implements an attachment store by writing files to a folder on disk.

This implementation is for React Native clients.
 */
import {
  AttachmentID,
  AttachmentMIMEType,
  getFileExtensionForAttachmentMIMEType,
} from "@withorbit/core";
import { AttachmentStore } from "@withorbit/store-shared";
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

  async storeAttachment(
    contents: Uint8Array,
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): Promise<void> {
    const buffer = Buffer.from(contents);
    await FileSystem.writeAsStringAsync(
      this._getLocalAttachmentURL(id, type),
      buffer.toString("base64"),
    );
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

  async getAttachmentContents(id: AttachmentID): Promise<Uint8Array> {
    const url = await this.getURLForStoredAttachment(id);
    if (!url) {
      throw new Error(`Missing data for attachment ${id}`);
    }
    // This is awfully inefficient. Probably should refactor this to allow the attachment store to do the uploading (or whatever). But for now...
    const base64Contents = await FileSystem.readAsStringAsync(
      url,
      FileSystem.EncodingType.Base64,
    );
    return Buffer.from(base64Contents, "base64");
  }

  private _getLocalAttachmentURL(
    id: AttachmentID,
    type: AttachmentMIMEType,
  ): string {
    const localPath = path.join(
      this._basePath,
      `${id}.${getFileExtensionForAttachmentMIMEType(type)}`,
    );
    return pathToFileURL(localPath).href;
  }
}
