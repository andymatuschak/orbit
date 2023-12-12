import fs from "fs";
import { LocalFileStorageService } from "../fileStorageService/localFileStorageService.js";
import { clearFirestoreData } from "./firebaseTesting.js";

export async function resetLocalEmulators() {
  await clearFirestoreData();
  await resetLocalFileServiceData();
}

export async function resetLocalFileServiceData() {
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
