import type {
  HostedReviewDatabaseResult,
  OpenHostedReviewDatabaseInput,
} from "../sync/openHostedReviewDatabase.types.js";
import { NativePerTaskDocuments } from "./nativePerTaskDocuments.js";

export async function tryOpenHostedReviewDatabase(
  input: OpenHostedReviewDatabaseInput,
): Promise<HostedReviewDatabaseResult> {
  return (
    await import("../sync/openHostedReviewDatabase.js")
  ).tryOpenHostedReviewDatabase(input);
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
