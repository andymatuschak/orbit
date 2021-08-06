import { AttachmentID, AttachmentMIMEType } from "@withorbit/core2";
import { AttachmentStore } from "@withorbit/store-shared";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { getPathForAttachment } from "./util/getPathForAttachment";

/*
Implements an attachment store by writing files to a folder on disk.

This implementation is for Node.js clients.
 */
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
    await fs.promises.writeFile(
      getPathForAttachment(this._basePath, id, type),
      contents,
    );
  }

  // If the attachment has already been stored, resolves to its local URL; otherwise resolves to null.
  async getURLForStoredAttachment(id: AttachmentID): Promise<string | null> {
    const type = await this._getAttachmentType(id);
    if (!type) {
      return null;
    }

    const attachmentPath = getPathForAttachment(this._basePath, id, type);
    const exists = await fs.promises
      .access(attachmentPath)
      .then(() => true)
      .catch(() => false);
    return exists ? pathToFileURL(attachmentPath).href : null;
  }

  async getAttachmentContents(id: AttachmentID): Promise<Uint8Array> {
    const url = await this.getURLForStoredAttachment(id);
    if (!url) {
      throw new Error(`Missing data for attachment ${id}`);
    }
    const path = fileURLToPath(url);
    return await fs.promises.readFile(path);
  }
}
