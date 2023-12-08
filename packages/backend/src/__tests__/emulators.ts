import fs from "fs";
import { LocalFileStorageService } from "../fileStorageService/localFileStorageService.js";
import {
  clearFirestoreData,
  startFirebaseTestingEmulator,
  stopFirebaseTestingEmulator,
} from "./firebaseTesting.js";

export async function startLocalEmulators() {
  await startFirebaseTestingEmulator();
  await deleteLocalFileServiceData();
}

export async function stopLocalEmulators() {
  await stopFirebaseTestingEmulator();
  await deleteLocalFileServiceData();
}

export async function resetLocalEmulators() {
  await clearFirestoreData();
  await deleteLocalFileServiceData();
}

async function deleteLocalFileServiceData() {
  await fs.promises
    .rm(LocalFileStorageService.getTestStorageLocation(), {
      recursive: true,
      force: true,
    })
    .catch(() => {
      return;
    }); // it's OK if this fails: it might not exist yet.
  await fs.promises.mkdir(LocalFileStorageService.getTestStorageLocation(), {
    recursive: true,
  });
}
