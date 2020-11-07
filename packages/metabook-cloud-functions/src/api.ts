import cookieParser from "cookie-parser";
import express from "express";
import { consumeAccessCode } from "./api/internal/auth/consumeAccessCode";
import { createLoginToken } from "./api/internal/auth/createLoginToken";
import { refreshSessionCookie } from "./api/internal/auth/refreshSessionCookie";
import { recordPageView } from "./api/internal/recordPageView";
import corsHandler from "./api/util/corsHandler";

export function createAPIApp(): express.Application {
  const app = express();
  app.use(corsHandler);
  app.use(cookieParser());
  app.use((request, _, next) => {
    console.log(
      `${request.method}: ${request.path}`,
      request.query,
      request.body,
    );
    next();
  });

  app.get("/internal/auth/createLoginToken", createLoginToken);
  app.get("/internal/auth/consumeAccessCode", consumeAccessCode);
  app.get("/internal/auth/refreshSessionCookie", refreshSessionCookie);

  app.get("/internal/recordPageView", recordPageView);

  return app;
}
