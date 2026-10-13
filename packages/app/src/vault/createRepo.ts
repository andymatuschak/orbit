import type { LabConnection } from "./labConnection.js";
import type { ReviewDatabase } from "../model2/openReviewDatabase.js";
import { NativePerTaskDocuments } from "./nativePerTaskDocuments.js";

export async function openLabReviewDatabase(
  connection: LabConnection,
): Promise<ReviewDatabase> {
  return (
    await import("../sync/openHostedReviewDatabase.js")
  ).openLabReviewDatabase(connection);
}

export async function openNativePerTaskDocuments(
  localStoreID: string,
): Promise<NativePerTaskDocuments> {
  const native = (
    await import("./orbitAutomergeNative.js")
  ).getOrbitAutomergeNative();
  await native.openRepo(localStoreID);
  return new NativePerTaskDocuments(localStoreID, native);
}
