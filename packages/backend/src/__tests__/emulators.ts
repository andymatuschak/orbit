import * as os from "os";
import path from "path";
import { _overrideSharedFileStorageService } from "../fileStorageService";
import { LocalFileStorageService } from "../fileStorageService/localFileStorageService";
import {
  clearFirestoreData,
  startFirebaseTestingEmulator,
  stopFirebaseTestingEmulator,
} from "./firebaseTesting";

import fs from "fs";

let localFileServicePath: string | null = null;

export async function startLocalEmulators() {
  await startFirebaseTestingEmulator();

  await resetLocalFileService();
}

export async function stopLocalEmulators() {
  await stopFirebaseTestingEmulator();
  await deleteLocalFileServiceData();
}

export async function resetLocalEmulators() {
  await resetLocalFileService();
  await clearFirestoreData();
}

async function resetLocalFileService() {
  await deleteLocalFileServiceData();

  localFileServicePath = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "orbit-test-"),
  );
  _overrideSharedFileStorageService(
    new LocalFileStorageService(localFileServicePath),
  );
}

async function deleteLocalFileServiceData() {
  if (localFileServicePath) {
    await fs.promises.rmdir(localFileServicePath);
  }
}
