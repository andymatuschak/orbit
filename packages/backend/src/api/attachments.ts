import { OrbitAPI } from "@withorbit/api";
import {
  AttachmentIDReference,
  AttachmentMimeType,
  getAttachmentTypeForAttachmentMimeType,
} from "@withorbit/core";
import * as backend from "../backend";
import { authenticatedRequestHandler } from "./util/authenticateRequest";
import { CachePolicy, TypedRouteHandler } from "./util/typedRouter";

export const storeAttachment: TypedRouteHandler<
  OrbitAPI.Spec,
  "/attachments",
  "POST"
> = authenticatedRequestHandler(async (request, userID) => {
  // TODO: rate limit storage...
  // TODO: attribute storage to users...

  // HACK: cheap way to validate mime type
  const attachmentMimeType = request.body.file.type as AttachmentMimeType;
  const buffer = new Uint8Array(await request.body.file.arrayBuffer());

  const attachmentType =
    getAttachmentTypeForAttachmentMimeType(attachmentMimeType);
  const result = await backend.attachments.storeAttachment(
    {
      mimeType: attachmentMimeType,
      contents: buffer,
      type: attachmentType,
    },
    userID,
    "core",
  );

  const reference: AttachmentIDReference = {
    type: attachmentType,
    byteLength: buffer.length,
    id: result.attachmentID,
  };

  return {
    status: ({ stored: 201, alreadyExists: 200 } as const)[result.status],
    cachePolicy: CachePolicy.NoStore,
    json: {
      objectType: "attachmentIDReference",
      id: result.attachmentID,
      data: reference,
    },
    headers: { Location: result.url },
  };
});

export const getAttachment: TypedRouteHandler<
  OrbitAPI.Spec,
  "/attachments/:id",
  "GET"
> = async (request) => {
  return {
    status: 302,
    redirectURL: backend.attachments.getAttachmentURL(
      request.params.id,
      null,
      "core",
    ),
    cachePolicy: CachePolicy.Immutable,
  };
};
