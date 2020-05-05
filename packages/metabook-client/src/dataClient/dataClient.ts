import firebase from "firebase/app";
import "firebase/firestore";
import "firebase/functions";

import { Attachment, AttachmentID, Prompt, PromptID } from "metabook-core";
import { DataRecord, DataRecordID } from "metabook-firebase-support";
import { getDefaultFirebaseApp } from "../firebase";

type MetabookDataClientCacheWriteHandler = (
  name: string,
  extension: string,
  data: Buffer,
) => Promise<string>;

export interface MetabookDataClient {
  recordPrompts(prompts: Prompt[]): Promise<unknown>;
  recordAttachments(attachments: Attachment[]): Promise<unknown>;

  getPrompts(promptIDs: Iterable<PromptID>): Promise<(Prompt | null)[]>;
  getAttachments(
    attachmentIDs: Iterable<AttachmentID>,
  ): Promise<(Attachment | null)[]>;
}

export type MetabookDataSnapshot<ID, Data> = Map<ID, Data | Error | null>; // null means the card data has not yet been fetched.

export class MetabookFirebaseDataClient implements MetabookDataClient {
  private readonly functions: firebase.functions.Functions;
  private readonly database: firebase.firestore.Firestore;

  constructor(
    firestore: firebase.firestore.Firestore,
    functions: firebase.functions.Functions,
  ) {
    this.database = firestore;
    this.functions = functions;
  }

  recordPrompts(prompts: Prompt[]): Promise<unknown> {
    return this.functions.httpsCallable("recordPrompts")({ prompts });
  }

  async recordAttachments(attachments: Attachment[]): Promise<void> {
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

  private async getData<R extends DataRecord, MappedData = R>(
    requestedIDs: Iterable<DataRecordID<R>>,
  ): Promise<(R | null)[]> {
    const recordIDs = [...requestedIDs];
    if (recordIDs.length === 0) {
      return [];
    }

    return this.functions
      .httpsCallable("getDataRecords")({ recordIDs })
      .then(({ data }) => {
        return data.records as (R | null)[];
      });
  }

  getPrompts(promptIDs: Iterable<PromptID>): Promise<(Prompt | null)[]> {
    return this.getData(promptIDs);
  }

  getAttachments(
    attachmentIDs: Iterable<AttachmentID>,
  ): Promise<(Attachment | null)[]> {
    return this.getData(attachmentIDs);
  }
}
