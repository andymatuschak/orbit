import { MetabookDataClient } from "metabook-client";
import {
  AttachmentID,
  AttachmentMimeType,
  AttachmentURLReference,
  getFileExtensionForAttachmentMimeType,
  imageAttachmentType,
  Prompt,
  PromptID,
} from "metabook-core";
import DataRecordStore from "./dataRecordStore";

export interface DataRecordClientFileStore {
  storeFileFromURL(
    url: string,
    attachmentID: AttachmentID,
  ): Promise<AttachmentURLReference>;
  storedURLExists(url: string): Promise<boolean>;
}

export default class DataRecordManager {
  private dataClient: MetabookDataClient;
  private dataCache: DataRecordStore;
  private fileStore: DataRecordClientFileStore;

  constructor(
    dataClient: MetabookDataClient,
    dataCache: DataRecordStore,
    fileStore: DataRecordClientFileStore,
  ) {
    this.dataClient = dataClient;
    this.dataCache = dataCache;
    this.fileStore = fileStore;
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
          this.dataCache.savePrompt(promptID, prompt);
        } else {
          console.warn("Unknown prompt ID", promptID);
        }
      }
    }
    return promptMap;
  }

  private async cacheAttachment(
    attachmentID: AttachmentID,
  ): Promise<AttachmentURLReference> {
    console.log("Caching attachment", attachmentID);
    const url = this.dataClient.getAttachmentURL(attachmentID);
    const attachmentURLReference = await this.fileStore.storeFileFromURL(
      url,
      attachmentID,
    );
    await this.dataCache.saveAttachmentURLReference(
      attachmentID,
      attachmentURLReference,
    );
    return attachmentURLReference;
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
            const exists = await this.fileStore.storedURLExists(reference.url);
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

      const cachePromises: Promise<void>[] = [];
      for (const id of missingIDs) {
        cachePromises.push(
          this.cacheAttachment(id)
            .catch<Error>((error) => error)
            .then((attachmentURLReference) => {
              if (attachmentURLReference instanceof Error) {
                console.error(
                  `Couldn't download attachment ${id}: ${attachmentURLReference}`,
                );
              } else {
                attachmentReferenceMap.set(id, attachmentURLReference);
              }
            }),
        );
      }
      await Promise.all(cachePromises);
    }
    return attachmentReferenceMap;
  }
}
