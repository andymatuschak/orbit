import { getFileExtensionForAttachmentMimeType } from "@withorbit/core";
import fs from "fs";
import fetch from "node-fetch";
import path from "path";
import { pipeline } from "stream";
import { pathToFileURL } from "url";
import { promisify } from "util";
import { AttachmentStore } from "../attachmentStore";
import { AttachmentReference } from "../core2";

const _pipeline = promisify(pipeline);

// Node.js-compatible implementation
export class AttachmentStoreFS implements AttachmentStore {
  private readonly _basePath: string;

  // basePath must be a path to a folder which already exists.
  constructor(basePath: string) {
    this._basePath = path.normalize(basePath);
  }

  async storeAttachmentFromURL(
    url: string,
    attachmentReference: AttachmentReference,
  ): Promise<void> {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
      throw new NodeHTTPError(response.status, await response.text());
    }

    await _pipeline(
      response.body,
      fs.createWriteStream(this._getPathForAttachment(attachmentReference)),
    );
  }

  // If the attachment has already been stored, resolves to its local URL; otherwise resolves to null.
  async getURLForStoredAttachment(
    attachmentReference: AttachmentReference,
  ): Promise<string | null> {
    const attachmentPath = this._getPathForAttachment(attachmentReference);
    const exists = await fs.promises
      .access(attachmentPath)
      .then(() => true)
      .catch(() => false);
    return exists ? pathToFileURL(attachmentPath).href : null;
  }

  private _getPathForAttachment(
    attachmentReference: AttachmentReference,
  ): string {
    return path.join(
      this._basePath,
      `${attachmentReference.id}.${getFileExtensionForAttachmentMimeType(
        attachmentReference.mimeType,
      )}`,
    );
  }
}

export class NodeHTTPError extends Error {
  private statusCode: number;
  private bodyText: string;

  constructor(statusCode: number, bodyText: string) {
    super(`HTTP request failed (status: ${statusCode}): ${bodyText}`);
    this.statusCode = statusCode;
    this.bodyText = bodyText;
  }
}
