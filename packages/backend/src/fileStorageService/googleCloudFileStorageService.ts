import { getStorage } from "firebase-admin/storage";
import { getApp } from "../firebaseApp.js";
import type {
  FileStorageResolution,
  FileStorageService,
} from "./fileStorageService.js";

// TODO: move to serviceConfig.ts
export const storageBucketName = "metabook-system.appspot.com";

export class GoogleCloudFileStorageService implements FileStorageService {
  private readonly _bucket: ReturnType<ReturnType<typeof getStorage>["bucket"]>;
  private readonly _bucketName: string = storageBucketName;

  constructor(
    storage = getStorage(getApp()),
    bucketName: string = storageBucketName,
  ) {
    this._bucket = storage.bucket(bucketName);
    this._bucketName = bucketName;
  }

  async fileExists(subpath: string): Promise<boolean> {
    const [exists] = await this._bucket.file(subpath).exists();
    return exists;
  }

  async storeFile(
    subpath: string,
    data: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    const fileRef = this._bucket.file(subpath);
    await fileRef.save(Buffer.from(data.buffer, data.byteOffset, data.length), {
      contentType: mimeType,
      public: true,
    });
    await fileRef.setMetadata({
      cacheControl: "public, max-age=604800, immutable",
    });
  }

  formatURL(subpath: string): string {
    // I'd normally be frightened of simply splatting subpath in here, since it's user-provided, but a) our attachment ID validator ensures it's alphanumeric; b) Google Storage paths aren't really paths; they're just strings with conventions around slashes. So people can't cause trouble by making attachment IDs like "../../../owned": that'll just result in an attachment literally named "userID/../../../owned".
    return `https://storage.googleapis.com/${this._bucketName}/${subpath}`;
  }

  async resolveFile(subpath: string): Promise<FileStorageResolution | null> {
    const mimeType = await this.getMIMEType(subpath);
    if (!mimeType) {
      return null;
    }
    const [data] = await this._bucket.file(subpath).download();
    return { data, mimeType };
  }

  async getMIMEType(subpath: string): Promise<string | null> {
    try {
      const [metadata] = await this._bucket.file(subpath).getMetadata();
      return metadata["contentType"] ?? null;
    } catch {
      return null;
    }
  }

  async copyFile(fromSubpath: string, toSubpath: string): Promise<void> {
    const fromFile = this._bucket.file(fromSubpath);
    const toFile = this._bucket.file(toSubpath);
    await fromFile.copy(toFile);
    await toFile.makePublic(); // this flag is not copied
  }
}
