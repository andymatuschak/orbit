import OrbitAPIClient from "@withorbit/api-client";
import {
  maximumEmbeddedAttachmentBytes,
  maximumEmbeddedReviewBatchSize,
  type EmbeddedProjectionResponse,
  type EmbeddedReviewBatch,
  type EmbeddedReviewResponse,
} from "@withorbit/api";
import {
  assertSafeAttachmentBytes,
  encodeUUIDBytesToWebSafeBase64ID,
  EventType,
  referencedAttachmentIDs,
  type Event,
  type EventID,
  type Task,
  type TaskID,
} from "@withorbit/core";
import serviceConfig from "../../serviceConfig.js";
import type { AuthenticationClient } from "../authentication/index.js";
import {
  HostedVaultClient,
  HostedVaultControlError,
  HostedVaultHTTPClient,
} from "../sync/HostedVaultClient.js";
import { isHostedSyncAccountEligible } from "../sync/hostedSyncCohort.js";
import type { EmbeddedReviewAPI } from "./EmbeddedReviewSession.js";

/** One page lifecycle; only transport differs while legacy accounts remain. */
export function createEmbeddedReviewAPI(
  authentication: AuthenticationClient,
  options: {
    serviceOrigin?: string;
    legacyOrigin?: string;
    hostedSyncEnabled?: boolean;
    hostedAccountIDs?: readonly string[];
    fetch?: typeof fetch;
  } = {},
): EmbeddedReviewAPI {
  const serviceOrigin =
    options.serviceOrigin ?? serviceConfig.hostedSyncServiceOrigin;
  const selectedFetch = options.fetch ?? fetch;
  // The control client stores this callback as a method. Calling native fetch
  // with that client's `this` receiver is illegal in a browser.
  const fetchImplementation = ((...arguments_: Parameters<typeof fetch>) =>
    selectedFetch(...arguments_)) as unknown as typeof fetch;
  const transports = new Map<string, Promise<EmbeddedReviewAPI>>();
  async function token(accountID: string) {
    async function assertAccount() {
      if ((await authentication.getUserAuthState())?.userID !== accountID) {
        throw new Error("Account changed during review request");
      }
    }
    await assertAccount();
    const value = await authentication.getCurrentIDToken();
    await assertAccount();
    return String(value);
  }
  async function post<T>(
    accountID: string,
    path: string,
    body: unknown,
  ): Promise<T> {
    const response = await fetchImplementation(
      new URL(`/v1/embedded/${path}`, serviceOrigin),
      {
        method: "POST",
        headers: {
          Authorization: `ID ${await token(accountID)}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (!response.ok)
      throw new Error(`Could not save or load reviews (${response.status})`);
    return response.json() as Promise<T>;
  }
  const hosted: EmbeddedReviewAPI = {
    async read(accountID, taskIDs) {
      const tasks: Task[] = [];
      for (const ids of chunks(taskIDs)) {
        tasks.push(
          ...(
            await post<EmbeddedProjectionResponse>(accountID, "projections", {
              taskIDs: ids,
            })
          ).tasks,
        );
      }
      return { tasks };
    },
    async save(accountID, batch) {
      const tasks = new Map<TaskID, Task>();
      const acceptedRequestIDs: string[] = [];
      for (const { reviews, attachments } of hostedBatches(batch)) {
        const response = await post<EmbeddedReviewResponse>(
          accountID,
          "reviews",
          { reviews, attachments },
        );
        for (const task of response.tasks) tasks.set(task.id, task);
        acceptedRequestIDs.push(...response.acceptedRequestIDs);
      }
      return { tasks: [...tasks.values()], acceptedRequestIDs };
    },
  };
  async function resolve(accountID: string): Promise<EmbeddedReviewAPI> {
    let transport = transports.get(accountID);
    if (!transport) {
      transport = (async () => {
        if (
          (options.hostedSyncEnabled ?? serviceConfig.hostedSyncEnabled) &&
          isHostedSyncAccountEligible(
            accountID,
            options.hostedAccountIDs ??
              serviceConfig.hostedSyncAuthenticationUserIDs,
          )
        ) {
          const control = new HostedVaultClient(
            new HostedVaultHTTPClient(serviceOrigin, fetchImplementation),
            authentication,
            accountID,
          );
          try {
            await control.resolveHostedRoot();
            return hosted;
          } catch (error) {
            if (
              !(error instanceof HostedVaultControlError) ||
              error.code !== "legacy-account"
            )
              throw error;
          }
        }
        const legacy = new OrbitAPIClient(
          async () => ({ idToken: await token(accountID) }),
          {
            baseURL:
              options.legacyOrigin ?? serviceConfig.httpsAPIBaseURLString,
            fetch: fetchImplementation,
          },
        );
        return legacyTransport(legacy);
      })().catch((error) => {
        transports.delete(accountID);
        throw error;
      });
      transports.set(accountID, transport);
    }
    return transport;
  }
  return {
    read: async (accountID, taskIDs) =>
      (await resolve(accountID)).read(accountID, taskIDs),
    save: async (accountID, batch) =>
      (await resolve(accountID)).save(accountID, batch),
  };
}

function hostedBatches(batch: EmbeddedReviewBatch): EmbeddedReviewBatch[] {
  const attachments = new Map(
    (batch.attachments ?? []).map((attachment) => [
      attachment.attachmentID,
      attachment,
    ]),
  );
  const sizes = new Map(
    [...attachments].map(([id, attachment]) => [
      id,
      bytesFromBase64(attachment.bytesBase64).length,
    ]),
  );
  const output: EmbeddedReviewBatch[] = [];
  let reviews: EmbeddedReviewBatch["reviews"] = [];
  let currentAttachments: typeof attachments = new Map();
  let byteLength = 0;
  for (const review of batch.reviews) {
    const ids = referencedAttachmentIDs(review.taskSeed.spec).filter((id) =>
      attachments.has(id),
    );
    const ownByteLength = ids.reduce((sum, id) => sum + sizes.get(id)!, 0);
    if (ownByteLength > maximumEmbeddedAttachmentBytes)
      throw new Error("This review's images exceed the upload limit");
    const addedBytes = ids.reduce(
      (sum, id) => sum + (currentAttachments.has(id) ? 0 : sizes.get(id)!),
      0,
    );
    if (
      reviews.length === maximumEmbeddedReviewBatchSize ||
      byteLength + addedBytes > maximumEmbeddedAttachmentBytes
    ) {
      output.push({ reviews, attachments: [...currentAttachments.values()] });
      reviews = [];
      currentAttachments = new Map();
      byteLength = 0;
    }
    reviews.push(review);
    for (const id of ids) {
      if (!currentAttachments.has(id)) {
        currentAttachments.set(id, attachments.get(id)!);
        byteLength += sizes.get(id)!;
      }
    }
  }
  if (reviews.length)
    output.push({ reviews, attachments: [...currentAttachments.values()] });
  return output;
}

function legacyTransport(
  client: Pick<OrbitAPIClient, "getTasks2" | "putEvents2" | "putAttachment2">,
): EmbeddedReviewAPI {
  const read: EmbeddedReviewAPI["read"] = async (_accountID, taskIDs) => {
    const tasks: Task[] = [];
    for (const ids of chunks(taskIDs))
      tasks.push(...(await client.getTasks2(ids)).items);
    return { tasks };
  };
  return {
    read,
    async save(accountID, batch) {
      const events = new Map<EventID, Event>();
      for (const review of batch.reviews) {
        const { taskSeed: task } = review;
        // Include the immutable seed in the ID: repeated iframe relays/retries
        // deduplicate, but a later publisher edit cannot rewrite an older event.
        const ingestID = await stableEventID("task", task);
        events.set(ingestID, {
          id: ingestID,
          type: EventType.TaskIngest,
          entityID: task.taskID,
          timestampMillis: task.createdAtTimestampMillis,
          spec: task.spec,
          provenance: task.provenance,
          metadata: task.metadata ?? {},
        });
        events.set(review.requestID as EventID, {
          id: review.requestID as EventID,
          type: EventType.TaskRepetition,
          entityID: review.taskID,
          timestampMillis: review.occurredAtTimestampMillis,
          componentID: review.componentID,
          outcome: review.outcome,
          reviewSessionID: review.sessionID,
        });
      }
      for (const attachment of batch.attachments ?? []) {
        const bytes = bytesFromBase64(attachment.bytesBase64);
        const mimeType = assertSafeAttachmentBytes({
          bytes,
          mediaTypeHint: attachment.mediaTypeHint,
        });
        await client.putAttachment2(attachment.attachmentID, mimeType, bytes);
        const timestampMillis = Math.min(
          ...batch.reviews.map(
            (review) => review.taskSeed.createdAtTimestampMillis,
          ),
        );
        const id = await stableEventID("attachment", {
          ...attachment,
          timestampMillis,
        });
        events.set(id, {
          id,
          entityID: attachment.attachmentID,
          type: EventType.AttachmentIngest,
          mimeType,
          timestampMillis,
        });
      }
      for (const eventBatch of chunks([...events.values()]))
        await client.putEvents2(eventBatch);
      const taskIDs = [
        ...new Set(batch.reviews.map((review) => review.taskID)),
      ];
      const response = await read(accountID, taskIDs);
      if (
        taskIDs.some((id) => !response.tasks.some((task) => task.id === id))
      ) {
        throw new Error("Saved reviews are not yet available; try again");
      }
      return {
        ...response,
        acceptedRequestIDs: batch.reviews.map((review) => review.requestID),
      };
    },
  };
}

async function stableEventID(kind: string, value: unknown): Promise<EventID> {
  const digest = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify([kind, value])),
    ),
  );
  return encodeUUIDBytesToWebSafeBase64ID(digest.subarray(0, 16)) as EventID;
}

function chunks<T>(values: readonly T[]): T[][] {
  const output: T[][] = [];
  for (let i = 0; i < values.length; i += maximumEmbeddedReviewBatchSize)
    output.push(values.slice(i, i + maximumEmbeddedReviewBatchSize));
  return output;
}

export function bytesFromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
