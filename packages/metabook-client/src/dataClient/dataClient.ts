import firebase from "firebase/app";
import "firebase/firestore";
import "firebase/functions";

import {
  Attachment,
  AttachmentID,
  getIDForAttachment,
  Prompt,
  PromptID,
} from "metabook-core";
import {
  storageBucketName,
  DataRecord,
  DataRecordID,
  storageAttachmentsPathComponent,
  getFirebaseKeyForCIDString,
} from "metabook-firebase-support";
import AttachmentUploader from "./attachmentUploader";

export interface MetabookDataClient {
  recordPrompts(prompts: Prompt[]): Promise<unknown>;
  recordAttachments(
    entries: Iterable<{ attachment: Attachment; id?: AttachmentID }>,
  ): Promise<unknown>;

  getPrompts(
    promptIDs: Iterable<PromptID>,
  ): Promise<Map<PromptID, Prompt | null>>;
  getAttachmentURL(attachmentID: AttachmentID): string;
}

export type MetabookDataSnapshot<ID, Data> = Map<ID, Data | Error | null>; // null means the card data has not yet been fetched.

export class MetabookFirebaseDataClient implements MetabookDataClient {
  private readonly functions: firebase.functions.Functions;
  private readonly database: firebase.firestore.Firestore;
  private readonly attachmentUploader: AttachmentUploader;

  constructor(
    firestore: firebase.firestore.Firestore,
    functions: firebase.functions.Functions,
    attachmentUploader: AttachmentUploader,
  ) {
    this.attachmentUploader = attachmentUploader;
    this.database = firestore;
    this.functions = functions;
  }

  recordPrompts(prompts: Prompt[]): Promise<unknown> {
    return this.functions.httpsCallable("recordPrompts")({ prompts });
  }

  async recordAttachments(
    entries: Iterable<{ attachment: Attachment; id?: AttachmentID }>,
  ): Promise<unknown> {
    const recordAttachment = async (
      attachment: Attachment,
      id?: AttachmentID,
    ) => {
      return this.attachmentUploader(
        attachment,
        id ?? (await getIDForAttachment(attachment.contents)),
      );
    };

    const promises: Promise<unknown>[] = [];
    for (const { attachment, id } of entries) {
      promises.push(recordAttachment(attachment, id));
    }
    return await Promise.all(promises);
  }

  private async getData<R extends DataRecord, MappedData = R>(
    requestedIDs: Iterable<DataRecordID<R>>,
  ): Promise<Map<DataRecordID<R>, R | null>> {
    const recordIDs = [...requestedIDs];
    if (recordIDs.length === 0) {
      return new Map();
    }

    const response = await this.functions.httpsCallable("getDataRecords")({
      recordIDs,
    });
    const records = response.data.records as (R | null)[];
    return new Map(records.map((record, index) => [recordIDs[index], record]));
  }

  getPrompts(
    promptIDs: Iterable<PromptID>,
  ): Promise<Map<PromptID, Prompt | null>> {
    return this.getData(promptIDs);
  }

  getAttachmentURL(attachmentID: AttachmentID): string {
    return `https://storage.googleapis.com/${storageBucketName}/${storageAttachmentsPathComponent}/${getFirebaseKeyForCIDString(
      attachmentID,
    )}`;
  }
}
