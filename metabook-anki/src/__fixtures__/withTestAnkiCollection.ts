import path from "path";
import {
  AnkiCollectionDBHandle,
  MediaManifest,
  readAnkiCollectionPackage,
} from "../ankiPkg";

export default function withTestAnkiCollection(
  continuation: (
    handle: AnkiCollectionDBHandle,
    mediaManifest: MediaManifest | null,
  ) => Promise<void>,
): Promise<void> {
  return readAnkiCollectionPackage(
    path.resolve(__dirname, "./testCollection.colpkg"),
    continuation,
  );
}
