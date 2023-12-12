import path from "path";
import {
  AnkiCollectionDBHandle,
  MediaManifest,
  readAnkiCollectionPackage,
} from "../ankiPkg/index.js";

export default function withTestAnkiCollection<R>(
  continuation: (
    handle: AnkiCollectionDBHandle,
    mediaManifest: MediaManifest | null,
    attachmentIDsToExtractedPaths: { [key: string]: string },
  ) => Promise<R>,
): Promise<R> {
  return readAnkiCollectionPackage(
    path.resolve(__dirname, "./testCollection.colpkg"),
    continuation,
  );
}
