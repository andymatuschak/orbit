export interface FileStorageService {
  fileExists(subpath: string): Promise<boolean>;
  storeFile(subpath: string, data: Uint8Array, mimeType: string): Promise<void>;
  formatURL(subpath: string): string;
  resolveFile(subpath: string): Promise<FileStorageResolution | null>;
  getMIMEType(subpath: string): Promise<string | null>;
  copyFile(fromSubpath: string, toSubpath: string): Promise<void>;
}

export type FileStorageResolution = { data: Uint8Array; mimeType: string };
