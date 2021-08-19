import { OrbitAPI } from "@withorbit/api";
import {
  AttachmentIngestEvent,
  EventType,
  generateUniqueID,
} from "@withorbit/core2";
import * as attachments2 from "../../attachments";
import { authenticatedRequestHandler } from "../util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "../util/typedRouter";
import { putAndLogEvents } from "./util/putAndLogEvents";

export const getAttachment: TypedRouteHandler<
  OrbitAPI.Spec,
  "/2/attachments/:id",
  "GET"
> = authenticatedRequestHandler(async (request, userID) => {
  // When running against Google Cloud Storage, we'll redirect to their URLs; when running against the emulator, we'll just vend the data directly.
  const result = await attachments2.resolveAttachment(
    request.params.id,
    userID,
  );

  if (result) {
    return {
      status: 200,
      data: result.data,
      mimeType: result.mimeType,
      cachePolicy: CachePolicy.Immutable,
    };
  } else {
    return {
      status: 404,
    };
  }
});

export const ingestAttachmentsFromURLs: TypedRouteHandler<
  OrbitAPI.Spec,
  "/2/attachments/ingestFromURLs",
  "POST"
> = authenticatedRequestHandler(async (request, userID) => {
  const entries = request.body;
  const ingestEvents: AttachmentIngestEvent[] = [];
  for (const { url, id } of entries) {
    // TODO: if the request to the remote URL fails, return an appropriate status code rather than 500
    const { mimeType, status } =
      await attachments2.storeAttachmentAtURLIfNecessary(userID, id, url);

    if (status === "stored") {
      ingestEvents.push({
        type: EventType.AttachmentIngest,
        id: generateUniqueID(),
        entityID: id,
        mimeType,
        timestampMillis: Date.now(),
      });
    }
  }

  await putAndLogEvents(userID, ingestEvents);

  return {
    status: 204,
  };
});

export const storeAttachment2: TypedRouteHandler<
  OrbitAPI.Spec,
  "/2/attachments/:id",
  "POST"
> = authenticatedRequestHandler(async (request, userID) => {
  // TODO: rate limit storage...
  const mimeType = request.body.file.type;
  const buffer = new Uint8Array(await request.body.file.arrayBuffer());

  await attachments2.storeAttachment(
    userID,
    request.params.id,
    buffer,
    mimeType,
  );

  return {
    status: 204,
  };
});
