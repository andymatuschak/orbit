import { MetabookDataClient } from "metabook-client";
import {
  AttachmentID,
  AttachmentURLReference,
  getFileExtensionForAttachmentMimeType,
  Prompt,
  PromptID,
} from "metabook-core";
import DataRecordCache from "./dataRecordCache";

export interface DataRecordClientFileStore {
  fileExistsAtURL(url: string): Promise<boolean>;
  writeFile(name: string, contents: Buffer): Promise<string>;
}

export default class DataRecordClient {
  private dataClient: MetabookDataClient;
  private dataCache: DataRecordCache;
  private fileStore: DataRecordClientFileStore;

  private cacheWrites: Promise<unknown>[];

  constructor(
    dataClient: MetabookDataClient,
    dataCache: DataRecordCache,
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
      // This looks inappropriate, but sets have stable insertion order.
      console.log("Getting remote prompts", missingIDs);
      const prompts = await this.dataClient.getPrompts(missingIDs);
      let index = 0;
      for (const missingID of missingIDs) {
        const prompt = prompts[index];
        if (prompt) {
          promptMap.set(missingID, prompt);
          this.cacheWrites.push(this.dataCache.savePrompt(missingID, prompt));
        } else {
          console.warn("Unknown prompt ID", missingID);
        }
        index++;
      }
    }
    return promptMap;
  }

  async getAttachments(
    attachmentIDs: Iterable<AttachmentID>,
  ): Promise<Map<AttachmentID, AttachmentURLReference | null>> {
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
      // This looks inappropriate, but sets have stable insertion order.
      const attachments = await this.dataClient.getAttachments(missingIDs);
      let index = 0;
      const attachmentWritePromises: Promise<unknown>[] = [];
      for (const missingID of missingIDs) {
        const attachment = attachments[index];
        if (attachment) {
          const extension = getFileExtensionForAttachmentMimeType(
            attachment.mimeType,
          );
          if (!extension) {
            console.warn(`Unknown attachment mime type ${attachment.mimeType}`);
          }
          const storedURI = await this.fileStore.writeFile(
            `${missingID}.${extension}`,
            Buffer.from(attachment.contents, "binary"),
          );
          const attachmentURLReference = {
            type: attachment.type,
            url: storedURI,
          };
          attachmentReferenceMap.set(missingID, attachmentURLReference);
          this.cacheWrites.push(
            this.dataCache.saveAttachmentURLReference(
              missingID,
              attachmentURLReference,
            ),
          );
        } else {
          console.warn("Unknown attachment ID", missingID);
        }
        index++;
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
