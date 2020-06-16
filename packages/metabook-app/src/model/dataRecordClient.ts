import { MetabookDataClient } from "metabook-client";
import {
  AttachmentID,
  AttachmentURLReference,
  getFileExtensionForAttachmentMimeType,
  Prompt,
  PromptID,
} from "metabook-core";
import DataRecordStore from "./dataRecordStore";

export interface DataRecordClientFileStore {
  fileExistsAtURL(url: string): Promise<boolean>;
  writeFile(name: string, contents: Buffer): Promise<string>;
}

export default class DataRecordClient {
  private dataClient: MetabookDataClient;
  private dataCache: DataRecordStore;
  private fileStore: DataRecordClientFileStore;

  private cacheWrites: Promise<unknown>[];

  constructor(
    dataClient: MetabookDataClient,
    dataCache: DataRecordStore,
    fileStore: DataRecordClientFileStore,
  ) {
    this.dataClient = dataClient;
    this.dataCache = dataCache;
    this.fileStore = fileStore;
    this.cacheWrites = [];
  }

  async getPrompts(promptIDs: Set<PromptID>): Promise<Map<PromptID, Prompt>> {
    const cachedPromptPromises: Promise<unknown>[] = [];
    const promptMap = new Map<PromptID, Prompt>();
    const missingIDs = new Set<PromptID>();
    for (const id of promptIDs) {
      cachedPromptPromises.push(
        this.dataCache.getPrompt(id).then((record) => {
          if (record) {
            promptMap.set(id, record);
          } else {
            missingIDs.add(id);
          }
        }),
      );
    }
    await Promise.all(cachedPromptPromises);

    if (missingIDs.size > 0) {
      console.log(`Getting ${missingIDs.size} remote prompts`);
      const prompts = await this.dataClient.getPrompts(missingIDs);
      for (const [promptID, prompt] of prompts) {
        if (prompt) {
          promptMap.set(promptID, prompt);
          this.cacheWrites.push(this.dataCache.savePrompt(promptID, prompt));
        } else {
          console.warn("Unknown prompt ID", promptID);
        }
      }
    }
    return promptMap;
  }

  async getAttachments(
    attachmentIDs: Iterable<AttachmentID>,
  ): Promise<Map<AttachmentID, AttachmentURLReference>> {
    const cachedAttachmentPromises: Promise<unknown>[] = [];
    const attachmentReferenceMap = new Map<
      AttachmentID,
      AttachmentURLReference
    >();
    const missingIDs = new Set<AttachmentID>();
    for (const id of attachmentIDs) {
      cachedAttachmentPromises.push(
        this.dataCache.getAttachmentURLReference(id).then(async (reference) => {
          if (reference) {
            const exists = await this.fileStore.fileExistsAtURL(reference.url);
            if (exists) {
              attachmentReferenceMap.set(id, reference);
            } else {
              missingIDs.add(id);
            }
          } else {
            missingIDs.add(id);
          }
        }),
      );
    }
    await Promise.all(cachedAttachmentPromises);

    if (missingIDs.size > 0) {
      console.log(`Getting ${missingIDs.size} remote attachments`);
      const attachments = await this.dataClient.getAttachments(missingIDs);
      const attachmentWritePromises: Promise<unknown>[] = [];
      for (const [attachmentID, attachment] of attachments) {
        if (attachment) {
          const extension = getFileExtensionForAttachmentMimeType(
            attachment.mimeType,
          );
          if (!extension) {
            console.warn(`Unknown attachment mime type ${attachment.mimeType}`);
          }
          const storedURI = await this.fileStore.writeFile(
            `${attachmentID}.${extension}`,
            Buffer.from(attachment.contents, "binary"),
          );
          const attachmentURLReference = {
            type: attachment.type,
            url: storedURI,
          };
          attachmentReferenceMap.set(attachmentID, attachmentURLReference);
          this.cacheWrites.push(
            this.dataCache.saveAttachmentURLReference(
              attachmentID,
              attachmentURLReference,
            ),
          );
        } else {
          console.warn("Unknown attachment ID", attachmentID);
        }
      }
      await Promise.all(attachmentWritePromises);
    }
    return attachmentReferenceMap;
  }

  async close() {
    // TODO: guard against races
    await Promise.all(this.cacheWrites);
    await this.dataCache.close();
  }
}
