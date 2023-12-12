import { FileStorageService } from "./fileStorageService.js";
import { GoogleCloudFileStorageService } from "./googleCloudFileStorageService.js";

let _sharedFileStorageService: FileStorageService | null;
export function sharedFileStorageService(): FileStorageService {
  if (!_sharedFileStorageService) {
    _sharedFileStorageService = new GoogleCloudFileStorageService();
  }
  return _sharedFileStorageService;
}
