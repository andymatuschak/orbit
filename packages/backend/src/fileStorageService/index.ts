import { isRunningInEmulator } from "../util/isRunningInEmulator";
import { FileStorageService } from "./fileStorageService";
import { GoogleCloudFileStorageService } from "./googleCloudFileStorageService";

let _sharedFileStorageService: FileStorageService | null;
export function sharedFileStorageService(): FileStorageService {
  if (!_sharedFileStorageService) {
    if (isRunningInEmulator) {
      throw new Error("File storage service hasn't been initialized");
    } else {
      _sharedFileStorageService = new GoogleCloudFileStorageService();
    }
  }
  return _sharedFileStorageService;
}
export { _sharedFileStorageService };

// i.e. for tests
export function _overrideSharedFileStorageService(
  sharedFileStorageService: FileStorageService,
) {
  _sharedFileStorageService = sharedFileStorageService;
}
