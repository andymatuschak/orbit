import { isRunningInEmulator } from "../util/isRunningInEmulator";
import { FileStorageService } from "./fileStorageService";
import { GoogleCloudFileStorageService } from "./googleCloudFileStorageService";
import { LocalFileStorageService } from "./localFileStorageService";

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
