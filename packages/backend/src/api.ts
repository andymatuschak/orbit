import { OrbitAPI } from "@withorbit/api";
import cookieParser from "cookie-parser";
import express from "express";
import { listActionLogs, storeActionLogs } from "./api/actionLogs";
import { getAttachment, storeAttachment } from "./api/attachments";
import { consumeAccessCode } from "./api/internal/auth/consumeAccessCode";
import { createLoginToken } from "./api/internal/auth/createLoginToken";
import { personalAccessTokens } from "./api/internal/auth/personalAccessTokens";
import { refreshSessionCookie } from "./api/internal/auth/refreshSessionCookie";
import { recordPageView } from "./api/internal/recordPageView";
import { resolveAttachmentIDs } from "./api/internal/resolveAttachmentIDs";
import { listTaskData, storeTaskData } from "./api/taskData";
import { listTaskStates } from "./api/taskStates";
import corsHandler from "./api/util/corsHandler";
import createTypedRouter from "./api/util/typedRouter";

const traceAPICall: express.RequestHandler = (request, _, next) => {
  console.log(
    `${request.method}: ${request.path}`,
    request.query,
    request.body,
  );
  next();
};

export function createAPIApp(): express.Application {
  const app = express();
  app.use(corsHandler);
  app.use(cookieParser());

  // When the Firebase function is routed through the hosting interface (i.e. https://withorbit.com/api), there'll be an extra /api prefix which won't be present when the function is invoked directly.
  app.use((request, _, next) => {
    if (request.headers["x-forwarded-host"] && request.url.startsWith("/api")) {
      request.url = request.url.slice("/api".length);
    }
    next();
  });
  app.use(traceAPICall);

  createTypedRouter<OrbitAPI.Spec>(app, {
    "/actionLogs": {
      GET: listActionLogs,
      PATCH: storeActionLogs,
    },
    "/taskStates": {
      GET: listTaskStates,
    },
    "/taskData": {
      GET: listTaskData,
      PATCH: storeTaskData,
    },
    "/attachments": {
      POST: storeAttachment,
    },
    "/attachments/:id": {
      GET: getAttachment,
    },
  });

  app.post("/internal/auth/personalAccessTokens", personalAccessTokens);

  // These older auth APIs need some rethinking...
  app.get("/internal/auth/createLoginToken", createLoginToken);
  app.get("/internal/auth/consumeAccessCode", consumeAccessCode);
  app.get("/internal/auth/refreshSessionCookie", refreshSessionCookie);

  app.post("/internal/recordPageView", recordPageView);

  app.get("/internal/resolveAttachmentIDs", resolveAttachmentIDs);

  return app;
}
