import { OrbitAPI } from "@withorbit/api";
import {
  ActionLog,
  ActionLogID,
  getIDForActionLog,
  getPromptActionLogFromActionLog,
  getPromptTaskForID,
} from "@withorbit/core";
import { Event, migration } from "@withorbit/core2";
import { Database } from "@withorbit/store-shared";
import * as backend from "../backend";
import { FirestoreDatabaseBackend } from "../backend/2/firestoreDatabaseBackend";
import { sharedLoggingService } from "../logging";
import { authenticatedRequestHandler } from "./util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "./util/typedRouter";

export const listActionLogs: TypedRouteHandler<
  OrbitAPI.Spec,
  "/actionLogs",
  "GET"
> = authenticatedRequestHandler(async (request, userID) => {
  const { query } = request;

  const actionLogs = await backend.actionLogs.listActionLogs(userID, {
    limit: 100,
    ...query,
  });

  // TODO: set cache control appropriately
  return {
    json: {
      objectType: "list",
      hasMore: false,
      data: [...actionLogs.entries()].map(([id, data]) => ({
        objectType: "actionLog",
        id,
        data,
      })),
    },
    status: 200,
    cachePolicy: CachePolicy.NoStore,
  };
});

export const storeActionLogs: TypedRouteHandler<
  OrbitAPI.Spec,
  "/actionLogs",
  "PATCH"
> = authenticatedRequestHandler(async (request, userID) => {
  const logs = request.body;
  await validateLogs(logs);

  const storedResults = await backend.actionLogs.storeActionLogs(
    userID,
    logs.map(({ data }) => data),
  );

  await Promise.all(
    storedResults.map(({ log, serverTimestampMillis, promptState }) =>
      sharedLoggingService.logActionLog({
        userID: userID,
        actionLog: log,
        serverTimestamp: serverTimestampMillis,
        newTaskState: promptState,
      }),
    ),
  );

  // Double-write new logs in core2 storage.
  await writeConvertedLogsToCore2Storage(logs, userID);

  return { status: 204 };
});

function validateLogs(
  logs: { id: ActionLogID; data: ActionLog }[],
): Promise<unknown> {
  return Promise.all(
    logs.map(async ({ id, data: log }) => {
      const computedID = await getIDForActionLog(log);
      if (id !== computedID) {
        throw new Error(
          `Computed ID for action log (${computedID}) does not match provided ID (${id}). ${JSON.stringify(
            log,
            null,
            "\t",
          )}`,
        );
      }
    }),
  );
}

async function writeConvertedLogsToCore2Storage(
  logs: { id: ActionLogID; data: ActionLog }[],
  userID: string,
) {
  const promptActionLogs = logs.map(({ id, data }) => ({
    id,
    log: getPromptActionLogFromActionLog(data),
  }));
  const promptIDs = new Set(
    promptActionLogs.map(({ log }) => {
      const promptTask = getPromptTaskForID(log.taskID);
      if (promptTask instanceof Error) {
        throw promptTask;
      }
      return promptTask.promptID;
    }),
  );

  const prompts = await backend.prompts.getPrompts([...promptIDs]);
  const migratedEvents: Event[] = [];
  for (const { id, log } of promptActionLogs) {
    const promptTask = getPromptTaskForID(log.taskID);
    if (promptTask instanceof Error) {
      throw promptTask;
    }
    const prompt = prompts.get(promptTask.promptID);
    if (!prompt) {
      console.error(`Unknown prompt with ID ${promptTask.promptID}`);
      continue;
    }

    migratedEvents.push(...migration.convertCore1ActionLog(log, id, prompt));
  }
  const db = new Database(new FirestoreDatabaseBackend(userID));
  await db.putEvents(migratedEvents);
}
