import firebase from "firebase/app";
import "firebase/firestore";
import "firebase/functions";

import {
  Attachment,
  AttachmentID,
  AttachmentURLReference,
  getFileExtensionForAttachmentMimeType,
  Prompt,
  PromptID,
} from "metabook-core";
import {
  getReferenceForAttachmentID,
  getReferenceForPromptID,
} from "metabook-firebase-shared";
import { getDefaultFirebaseApp } from "../firebase";
import { MetabookUnsubscribe } from "../types/unsubscribe";

type MetabookDataClientCacheWriteHandler = (
  name: string,
  extension: string,
  data: Buffer,
) => Promise<string>;

export interface MetabookDataClient {
  recordPrompts(prompts: Prompt[]): Promise<unknown>;
  recordAttachments(attachments: Attachment[]): Promise<unknown>;

  getPrompts(
    requestedPromptIDs: Set<PromptID>,
    onUpdate: (snapshot: MetabookDataSnapshot<PromptID, Prompt>) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe };

  getAttachments(
    requestedAttachmentIDs: Set<AttachmentID>,
    onUpdate: (
      snapshot: MetabookDataSnapshot<AttachmentID, AttachmentURLReference>,
    ) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe };
}

export type MetabookDataSnapshot<ID, Data> = Map<ID, Data | Error | null>; // null means the card data has not yet been fetched.

export class MetabookFirebaseDataClient implements MetabookDataClient {
  private readonly functions: firebase.functions.Functions;
  private readonly database: firebase.firestore.Firestore;
  private readonly cacheWriteHandler: MetabookDataClientCacheWriteHandler;

  constructor(
    app: firebase.app.App = getDefaultFirebaseApp(),
    functionsInstance: firebase.functions.Functions = app.functions(),
    cacheWriteHandler: MetabookDataClientCacheWriteHandler,
  ) {
    this.database = app.firestore();
    this.functions = functionsInstance;
    this.cacheWriteHandler = cacheWriteHandler;
  }

  recordPrompts(prompts: Prompt[]): Promise<unknown> {
    // TODO locally cache new prompts
    return this.functions.httpsCallable("recordPrompts")({ prompts });
  }

  async recordAttachments(attachments: Attachment[]): Promise<void> {
    // TODO locally cache attachments
    const queue = [...attachments];
    let batch: Attachment[] = [];
    let batchBytes = 0;
    let count = 0;

    const recordAttachmentsFunction = this.functions.httpsCallable(
      "recordAttachments",
    );
    async function flush() {
      await recordAttachmentsFunction({
        attachments: batch,
      });
      count += batch.length;
      batch = [];
      batchBytes = 0;
      console.log(`Recorded attachment ${count}/${attachments.length}`);
    }
    while (queue.length > 0) {
      const attachment = queue.shift()!;
      const attachmentSize = attachment.contents.length;
      if (batchBytes + attachmentSize >= 1e6) {
        await flush();
      }
      batch.push(attachment);
      batchBytes += attachmentSize;
    }
    await flush();
  }

  private getData<
    ID extends PromptID | AttachmentID,
    Data extends Prompt | Attachment,
    MappedData = Data
  >(
    requestedIDs: Set<ID>,
    getReferenceForID: (id: ID) => firebase.firestore.DocumentReference,
    mapRetrievedType: (id: ID, data: Data) => Promise<MappedData | Error>,
    onUpdate: (snapshot: MetabookDataSnapshot<ID, MappedData>) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe } {
    const dataSnapshot: MetabookDataSnapshot<ID, MappedData> = new Map(
      [...requestedIDs.values()].map((promptID) => [promptID, null]),
    );

    let isCancelled = false;

    async function onFetch(id: ID, result: Data | Error) {
      // TODO: Validate spec
      let mappedData: MappedData | Error;
      if (result instanceof Error) {
        mappedData = result;
      } else {
        mappedData = await mapRetrievedType(id, result);
      }
      dataSnapshot.set(id, mappedData);
      if (!isCancelled) {
        onUpdate(new Map(dataSnapshot));
      }
    }

    if (requestedIDs.size === 0) {
      onUpdate(new Map());
      return {
        completion: Promise.resolve(),
        unsubscribe: () => {
          return;
        },
      };
    } else {
      const fetchPromises = [...requestedIDs.values()].map(async (id) => {
        const dataRef = getReferenceForID(id);
        try {
          const cachedData = await dataRef.get({
            source: "cache",
          });
          console.log("Read from cache", id, cachedData.data());
          onFetch(id, cachedData.data()! as Data);
        } catch (error) {
          // No cached data available.
          if (!isCancelled) {
            try {
              const cachedData = await dataRef.get();
              await onFetch(id, cachedData.data()! as Data);
            } catch (error) {
              await onFetch(id, error);
            }
          }
        }
      });

      return {
        completion: Promise.all(fetchPromises),
        unsubscribe: () => {
          isCancelled = true;
        },
      };
    }
  }

  getPrompts(
    requestedPromptIDs: Set<PromptID>,
    onUpdate: (snapshot: MetabookDataSnapshot<PromptID, Prompt>) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe } {
    return this.getData(
      requestedPromptIDs,
      (promptID) => getReferenceForPromptID(this.database, promptID),
      async (id: PromptID, data: Prompt) => data,
      onUpdate,
    );
  }

  getAttachments(
    requestedAttachmentIDs: Set<AttachmentID>,
    onUpdate: (
      snapshot: MetabookDataSnapshot<AttachmentID, AttachmentURLReference>,
    ) => void,
  ): { completion: Promise<unknown>; unsubscribe: MetabookUnsubscribe } {
    // This is an awfully silly way to handle caching. We'll want to write the attachments out to disk in a temporary directory.
    return this.getData(
      requestedAttachmentIDs,
      (attachmentID) =>
        getReferenceForAttachmentID(this.database, attachmentID),
      async (
        attachmentID: AttachmentID,
        attachment: Attachment,
      ): Promise<AttachmentURLReference | Error> => {
        const extension = getFileExtensionForAttachmentMimeType(
          attachment.mimeType,
        );
        if (!extension) {
          return new Error(
            `Unknown attachment mime type ${attachment.mimeType}`,
          );
        }
        const cacheURI = await this.cacheWriteHandler(
          attachmentID,
          extension,
          Buffer.from(attachment.contents, "binary"),
        );
        return {
          type: attachment.type,
          url: cacheURI,
        };
      },
      onUpdate,
    );
  }
}
