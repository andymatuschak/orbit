export interface FileStorageService {
  fileExists(subpath: string): Promise<boolean>;
  storeFile(subpath: string, data: Uint8Array, mimeType: string): Promise<void>;
  formatURL(subpath: string): string;
  getMIMEType(subpath: string): Promise<string | null>;
  copyFile(fromSubpath: string, toSubpath: string): Promise<void>;
}
