import { getFileExtensionForAttachmentMIMEType } from "@withorbit/core";
import type { PerTaskRepository } from "@withorbit/store-shared/perTaskRepository";
import { WidgetProjectionCoordinator } from "../vault/WidgetProjectionCoordinator.js";
import type { WidgetProjectionBridge } from "../vault/widgetProjection.js";
import { HostedReviewDatabase } from "./HostedReviewDatabase.js";
import { openBoundNativeHostedVault } from "./NativeHostedVaultBootstrap.js";
import type { LabConnection } from "../vault/labConnection.js";

export interface NativeHostedReviewDatabaseDependencies {
  runOpenBound?: typeof openBoundNativeHostedVault;
  reviewQueueDebounceMillis?: number;
  documentTimeoutMillis?: number;
  widgetProjectionBridge?: WidgetProjectionBridge | null;
  onWidgetError?: (error: unknown) => void;
  subscribeToForeground?: (listener: () => void) => () => void;
}

/** A private cache opens without authentication or laptop availability. */
export async function openLabReviewDatabase(
  connection: LabConnection,
  dependencies: NativeHostedReviewDatabaseDependencies = {},
): Promise<HostedReviewDatabase> {
  const openingStartedAt = Date.now();
  const vault = await (dependencies.runOpenBound ?? openBoundNativeHostedVault)(
    {
      entry: connection,
      requestCredential: async () => ({
        kind: "pairedToken",
        token: connection.token,
      }),
      documentTimeoutMillis: dependencies.documentTimeoutMillis,
    },
  );
  console.log(
    "[Performance] Local hosted vault opened",
    Date.now() - openingStartedAt,
    "ms",
  );
  return openNativeHostedReviewDatabase(vault, dependencies);
}

export async function openNativeHostedReviewDatabase(
  vault: PerTaskRepository,
  dependencies: NativeHostedReviewDatabaseDependencies,
): Promise<HostedReviewDatabase> {
  const bridge =
    dependencies.widgetProjectionBridge === undefined
      ? (
          await import("../vault/widgetProjectionBridge.js")
        ).getWidgetProjectionBridge()
      : dependencies.widgetProjectionBridge;
  const onError =
    dependencies.onWidgetError ??
    ((error: unknown) =>
      console.error("Could not update the review widget", error));
  const widget = bridge
    ? new WidgetProjectionCoordinator(vault.vaultID, bridge, onError)
    : undefined;
  if (widget) {
    try {
      await widget.importPendingReviews(
        async (mutations) => {
          await vault.apply(mutations);
        },
        () => vault.getReviewQueue(undefined, undefined, { localOnly: true }),
      );
    } catch (error) {
      onError(error);
    }
  }
  return new HostedReviewDatabase(vault, {
    widget,
    onError,
    debounceMillis: dependencies.reviewQueueDebounceMillis,
    subscribeToForeground:
      dependencies.subscribeToForeground ?? bridge?.subscribeToForeground,
    async attachmentURL(attachment) {
      const [{ File, Paths }, Crypto] = await Promise.all([
        import("expo-file-system"),
        import("expo-crypto"),
      ]);
      const extension = getFileExtensionForAttachmentMIMEType(
        attachment.mediaType,
      );
      const digest = new Uint8Array(
        await Crypto.digest(
          Crypto.CryptoDigestAlgorithm.SHA256,
          Uint8Array.from(attachment.bytes),
        ),
      );
      const file = new File(
        Paths.cache,
        "orbit-hosted-attachments",
        `${[...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("")}.${extension}`,
      );
      file.create({ intermediates: true, overwrite: true });
      await file.write(Uint8Array.from(attachment.bytes));
      return file.uri;
    },
    async releaseAttachmentURLs(urls) {
      const cached = [...urls];
      if (cached.length === 0) return;
      const { File } = await import("expo-file-system");
      for (const url of cached) {
        const file = new File(url);
        if (file.exists) file.delete();
      }
    },
  });
}
