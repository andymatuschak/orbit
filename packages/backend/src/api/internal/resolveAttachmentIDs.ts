import express from "express";
import { storeAttachmentAtURLIfNecessary } from "../../backend/attachments";
import { extractArrayQueryParameter } from "../util/extractArrayQueryParameter";

// TODO: rate limit storage...
// Embedded Orbit prompts can specify attachments by URLs, but the Orbit client fetches attachments from the Orbit servers, not from arbitrary servers.
export async function resolveAttachmentIDs(
  request: express.Request,
  response: express.Response,
) {
  const attachmentURLs = extractArrayQueryParameter(request, "attachmentURLs");
  if (attachmentURLs === null) {
    response.status(400).send("Missing attachmentURLs parameter");
    return;
  }
  const referrer = request.query["referrer"];
  if (typeof referrer !== "string") {
    response.status(400).send("Missing or invalid referrer parameter");
    return;
  }

  // TODO: log attachment referrers for audit purposes

  const attachmentIDs = await Promise.all(
    attachmentURLs.map(async (url) => [
      url,
      await storeAttachmentAtURLIfNecessary(url, null, "core")
        .then((idReference) => ({ idReference }))
        .catch((error: Error) => ({
          error: { name: error.name, message: error.message },
        })),
    ]),
  );
  response.json(Object.fromEntries(attachmentIDs));
}
