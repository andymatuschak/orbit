import { OrbitAPI, OrbitAPIValidator } from "@withorbit/api";
import cookieParser from "cookie-parser";
import express from "express";
import morganBody from "morgan-body";
import {
  getAttachment,
  ingestAttachmentsFromURLs,
  storeAttachment,
} from "./api/attachments.js";
import { listEvents, storeEvents } from "./api/events.js";
import { consumeAccessCode } from "./api/internal/auth/consumeAccessCode.js";
import { createLoginToken } from "./api/internal/auth/createLoginToken.js";
import { personalAccessTokens } from "./api/internal/auth/personalAccessTokens.js";
import { refreshSessionCookie } from "./api/internal/auth/refreshSessionCookie.js";
import { recordPageView } from "./api/internal/recordPageView.js";
import { InternalAPISpec } from "./api/internalSpec.js";
import { bulkGetTasks } from "./api/tasks.js";
import corsHandler from "./api/util/corsHandler.js";
import createTypedRouter from "./api/util/typedRouter.js";

const routeValidator = new OrbitAPIValidator({
  allowUnsupportedRoute: true,
  mutateWithDefaultValues: true,
});

export function createAPIApp(): express.Application {
  const app = express();
  app.use(corsHandler);
  app.use(cookieParser());

  // HACK: When the Firebase cloud function running this Express app is routed through its Firebase Hosting mount point (i.e. https://withorbit.com/api), there'll be an extra /api prefix which won't be present when the function is invoked directly. So we remove it here.
  app.use((request, _, next) => {
    if (request.headers["x-forwarded-host"] && request.url.startsWith("/api")) {
      request.url = request.url.slice("/api".length);
    }
    next();
  });

  morganBody(app, {
    maxBodyLength: 10000,
    noColors: true,
  }); // Log request and response data.

  createTypedRouter<OrbitAPI.Spec>(app, routeValidator, {
    "/attachments/ingestFromURLs": {
      POST: ingestAttachmentsFromURLs,
    },
    "/attachments/:id": {
      GET: getAttachment,
      POST: storeAttachment,
    },
    "/events": {
      PATCH: storeEvents,
      GET: listEvents,
    },
    "/tasks/bulkGet": {
      POST: bulkGetTasks,
    },
  });

  createTypedRouter<InternalAPISpec>(
    app,
    {
      // TODO validate internal API calls
      validateRequest: () => true,
      validateResponse: () => true,
    },
    {
      "/internal/auth/consumeAccessCode": { GET: consumeAccessCode },
      "/internal/auth/personalAccessTokens": { POST: personalAccessTokens },
    },
  );

  // These older auth APIs need some rethinking...
  app.get("/internal/auth/createLoginToken", createLoginToken);
  app.get("/internal/auth/refreshSessionCookie", refreshSessionCookie);

  app.post("/internal/recordPageView", recordPageView);

  return app;
}
