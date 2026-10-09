import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  assertSafeAttachmentBytes,
  referencedAttachmentIDs,
  type AttachmentID,
  type AttachmentMIMEType,
  type TaskRepetitionOutcome,
  type TaskSeedInput,
} from "@withorbit/core";
import type {
  EmbeddedHostState,
  EmbeddedScreenConfiguration,
  EmbeddedScreenRecord,
} from "@withorbit/embedded-support";
import type { AuthenticationClient } from "../authentication/index.js";
import { EmbeddedReviewSession } from "./EmbeddedReviewSession.js";
import { createEmbeddedReviewAPI } from "./embeddedReviewAPI.js";
import { EmbeddedHostBridge } from "./embeddedHostBridge.js";
import type { EmbeddedAuthenticationState } from "./useEmbeddedAuthenticationState.js";

export function useEmbeddedReviewSession(
  configuration: EmbeddedScreenConfiguration,
  bridge: EmbeddedHostBridge,
  hostState: EmbeddedHostState | null,
  authentication: AuthenticationClient,
  authenticationState: EmbeddedAuthenticationState,
) {
  const [revision, invalidate] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const generation = useRef(0);
  const errorOperation = useRef(0);
  const accountID =
    !configuration.isDebug && authenticationState.status === "signedIn"
      ? authenticationState.userRecord.userID
      : null;
  const resources = useMemo(() => {
    const attachments = new Map<
      AttachmentID,
      Promise<{ bytes: Uint8Array; mediaType: AttachmentMIMEType; url: string }>
    >();
    const URLs = new Set<string>();
    const loadAttachment = (id: AttachmentID) => {
      let pending = attachments.get(id);
      if (!pending) {
        pending = bridge
          .requestAttachment(id)
          .then((result) => {
            const bytes = new Uint8Array(result.bytes);
            const mediaType = assertSafeAttachmentBytes({
              bytes,
              mediaTypeHint: result.mediaTypeHint ?? undefined,
            });
            const url = URL.createObjectURL(
              new Blob([result.bytes], { type: mediaType }),
            );
            URLs.add(url);
            return { url, bytes, mediaType };
          })
          .catch((error) => {
            attachments.delete(id);
            throw error;
          });
        attachments.set(id, pending);
      }
      return pending;
    };
    const registeredAtTimestampMillis = Date.now();
    const seeds = (record: EmbeddedScreenRecord): TaskSeedInput[] =>
      record.tasks.map((seed) => ({
        ...seed,
        createdAtTimestampMillis: registeredAtTimestampMillis,
        provenance: {
          identifier: configuration.embeddedHostMetadata.url,
          url: configuration.embeddedHostMetadata.url,
          ...(configuration.embeddedHostMetadata.title && {
            title: configuration.embeddedHostMetadata.title,
          }),
          ...(configuration.embeddedHostMetadata.siteName && {
            containerTitle: configuration.embeddedHostMetadata.siteName,
          }),
          ...(configuration.embeddedHostMetadata.colorPaletteName && {
            colorPaletteName:
              configuration.embeddedHostMetadata.colorPaletteName,
          }),
        },
      }));
    const session = new EmbeddedReviewSession({
      sessionID: configuration.sessionID,
      api: createEmbeddedReviewAPI(authentication),
      prepareTask: (seed) =>
        Promise.all(
          referencedAttachmentIDs(seed.spec).map(async (id) => {
            const attachment = await loadAttachment(id);
            let binary = "";
            for (const byte of attachment.bytes)
              binary += String.fromCharCode(byte);
            return {
              attachmentID: id,
              mediaTypeHint: attachment.mediaType,
              bytesBase64: btoa(binary),
            };
          }),
        ),
    });
    session.registerSection(seeds(configuration));
    return {
      session,
      seeds,
      loadAttachment,
      dispose: () => {
        for (const url of URLs) URL.revokeObjectURL(url);
      },
    };
  }, [authentication, bridge, configuration]);

  const publish = useCallback(() => invalidate((value) => value + 1), []);
  const refresh = useCallback(async () => {
    const attempt = generation.current;
    const operation = ++errorOperation.current;
    try {
      await resources.session.refresh();
      if (generation.current === attempt) {
        publish();
        if (errorOperation.current === operation) setError(null);
      }
    } catch (value) {
      if (
        generation.current === attempt &&
        errorOperation.current === operation
      )
        setError(asError(value));
    }
  }, [publish, resources]);

  useEffect(() => {
    const previousCount = resources.session.tasks().length;
    for (const record of hostState?.orderedScreenRecords ?? []) {
      if (record) resources.session.registerSection(resources.seeds(record));
    }
    publish();
    const unsubscribe = bridge.subscribeToPageReviews((review) => {
      resources.session.receivePageReview(review);
      publish();
    });
    if (resources.session.tasks().length !== previousCount) void refresh();
    return unsubscribe;
  }, [bridge, hostState, publish, refresh, resources]);

  useEffect(() => {
    const attempt = ++generation.current;
    const errorAttempt = ++errorOperation.current;
    setError(null);
    const operation = resources.session.selectAccount(accountID);
    publish();
    void operation.then(
      () => {
        if (generation.current === attempt) {
          publish();
          if (errorOperation.current === errorAttempt) setError(null);
        }
      },
      (value) => {
        if (
          generation.current === attempt &&
          errorOperation.current === errorAttempt
        )
          setError(asError(value));
      },
    );
    return () => {
      generation.current = attempt + 1;
    };
  }, [accountID, publish, resources]);

  useEffect(() => {
    // A section gets current account state when scrolled into view or revisited.
    // It does not keep a WebSocket, subscription, or background polling loop.
    const onFocus = () => {
      if (document.visibilityState !== "hidden") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    let visible = false;
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => {
            const nextVisible = entries.some((entry) => entry.isIntersecting);
            if (nextVisible && !visible) onFocus();
            visible = nextVisible;
          });
    observer?.observe(document.documentElement);
    return () => {
      observer?.disconnect();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  useEffect(() => () => resources.dispose(), [resources]);

  const mark = useCallback(
    async (
      taskID: Parameters<EmbeddedReviewSession["mark"]>[0],
      componentID: string,
      outcome: TaskRepetitionOutcome,
      requestID?: string,
    ) => {
      const attempt = generation.current;
      const operation = ++errorOperation.current;
      try {
        if (resources.session.selectedAccountID !== accountID) {
          throw new Error("Account is still changing; try again");
        }
        const result = await resources.session.mark(
          taskID,
          componentID,
          outcome,
          requestID,
        );
        if (generation.current !== attempt)
          throw new Error("Account changed while saving; try again");
        if (result.pageReview && !configuration.isDebug)
          bridge.sendPageReview(result.pageReview);
        publish();
        if (errorOperation.current === operation) setError(null);
        return result;
      } catch (value) {
        if (
          generation.current === attempt &&
          errorOperation.current === operation
        )
          setError(asError(value));
        throw value;
      }
    },
    [accountID, bridge, configuration.isDebug, publish, resources],
  );

  const tasks = useMemo(() => {
    // The session mutates only at explicit page/API boundaries; this revision
    // keeps its rendered projection stable between those boundaries.
    void revision;
    return resources.session.tasks(accountID);
  }, [accountID, resources, revision]);
  return {
    tasks,
    mark,
    refresh,
    error,
    hasPendingReviews: resources.session.pendingCount() > 0,
    getURLForAttachmentID: useCallback(
      async (id: AttachmentID) => (await resources.loadAttachment(id)).url,
      [resources],
    ),
  };
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
