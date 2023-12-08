import { isRunningInEmulator } from "../util/isRunningInEmulator.js";
import { FileStorageService } from "./fileStorageService.js";
import { GoogleCloudFileStorageService } from "./googleCloudFileStorageService.js";
import { LocalFileStorageService } from "./localFileStorageService.js";

let _sharedFileStorageService: FileStorageService | null;
export function sharedFileStorageService(): FileStorageService {
  if (!_sharedFileStorageService) {
    if (isRunningInEmulator) {
      _sharedFileStorageService = new LocalFileStorageService();
    } else {
      _sharedFileStorageService = new GoogleCloudFileStorageService();
    }
  }
  return _sharedFileStorageService;
}
