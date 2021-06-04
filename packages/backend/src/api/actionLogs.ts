import { OrbitAPI } from "@withorbit/api";
import { ActionLog, ActionLogID, getIDForActionLog } from "@withorbit/core";
import * as backend from "../backend";
import { sharedLoggingService } from "../logging";
import { authenticatedRequestHandler } from "../util/authenticateRequest";
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

  return { status: 204 };
});
