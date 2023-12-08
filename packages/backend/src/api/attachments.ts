import { OrbitAPI } from "@withorbit/api";
import {
  AttachmentIngestEvent,
  EventType,
  generateUniqueID,
} from "@withorbit/core";
import { authenticatedRequestHandler } from "./util/authenticateRequest.js";
import { CachePolicy, TypedRouteHandler } from "./util/typedRouter.js";
import { putAndLogEvents } from "./util/putAndLogEvents.js";
import {
  resolveAttachment,
  storeAttachment as _storeAttachment,
  storeAttachmentAtURLIfNecessary,
} from "../attachments.js";

export const getAttachment: TypedRouteHandler<
  OrbitAPI.Spec,
  "/attachments/:id",
  "GET"
> = authenticatedRequestHandler(async (request, userID) => {
  // When running against Google Cloud Storage, we'll redirect to their URLs; when running against the emulator, we'll just vend the data directly.
  const result = await resolveAttachment(request.params.id, userID);

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
  "/attachments/ingestFromURLs",
  "POST"
> = authenticatedRequestHandler(async (request, userID) => {
  const entries = request.body;
  const ingestEvents: AttachmentIngestEvent[] = [];
  for (const { url, id } of entries) {
    // TODO: if the request to the remote URL fails, return an appropriate status code rather than 500
    const { mimeType, status } = await storeAttachmentAtURLIfNecessary(
      userID,
      id,
      url,
    );

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

export const storeAttachment: TypedRouteHandler<
  OrbitAPI.Spec,
  "/attachments/:id",
  "POST"
> = authenticatedRequestHandler(async (request, userID) => {
  // TODO: rate limit storage...
  const mimeType = request.body.file.type;
  const buffer = new Uint8Array(await request.body.file.arrayBuffer!());

  await _storeAttachment(userID, request.params.id, buffer, mimeType);

  return {
    status: 204,
  };
});
