import fs from "fs";
import os from "os";
import path from "path";
import { pathToFileURL } from "url";
import { isRunningInEmulator } from "../util/isRunningInEmulator.js";
import { isRunningInTest } from "../util/isRunningInTest.js";
import {
  FileStorageResolution,
  FileStorageService,
} from "./fileStorageService.js";

// n.b. not suitable for use in production; used only in testing and as an emulator for Google Cloud Storage in development.
export class LocalFileStorageService implements FileStorageService {
  readonly basePath: string;

  static getTestStorageLocation(): string {
    return path.join(os.tmpdir(), "orbit-file-storage-emulator");
  }

  constructor(
    basePath: string = LocalFileStorageService.getTestStorageLocation(),
  ) {
    this.basePath = basePath;
    console.log(
      `[File storage service]: Initializing with base path ${basePath}`,
    );
    // This is awfully rude, but because this is just used for testing, I don't mind the blocking call.
    fs.mkdirSync(basePath, { recursive: true });
  }

  async fileExists(subpath: string): Promise<boolean> {
    return await fs.promises
      .stat(this._getStorePath(subpath))
      .then(() => true)
      .catch(() => false);
  }

  async storeFile(
    subpath: string,
    data: Uint8Array,
    mimeType: string,
  ): Promise<void> {
    console.log(`[File storage service]: Storing ${subpath} (${mimeType})`);
    await fs.promises.writeFile(this._getStorePath(subpath), data);
    await this._writeMIMETypeMapping(subpath, mimeType);
  }

  formatURL(subpath: string): string {
    return pathToFileURL(this._getStorePath(subpath)).href;
  }

  async copyFile(fromSubpath: string, toSubpath: string): Promise<void> {
    console.log(
      `[File storage service]: Copying ${fromSubpath} to ${toSubpath}`,
    );
    await fs.promises.copyFile(
      this._getStorePath(fromSubpath),
      this._getStorePath(toSubpath),
    );
    await this._writeMIMETypeMapping(
      toSubpath,
      (await this._getMIMETypeMapping(fromSubpath))!,
    );
  }

  async getMIMEType(subpath: string): Promise<string | null> {
    return await this._getMIMETypeMapping(subpath);
  }

  async resolveFile(subpath: string): Promise<FileStorageResolution | null> {
    const mimeType = await this.getMIMEType(subpath);
    if (mimeType) {
      const filePath = this._getStorePath(subpath);
      const data = await fs.promises.readFile(filePath);
      return { data, mimeType };
    } else {
      return null;
    }
  }

  private _getStorePath(subpath: string): string {
    // n.b. not a safe operation in production, since subpath is in part user-supplied. This is fine in a testing environment, but I want to make sure we don't accidentally deploy this without thinking about this more carefully.
    if (!(isRunningInEmulator || isRunningInTest)) {
      throw new Error("This implementation is only valid in test environments");
    }
    return path.join(this.basePath, subpath.replace(/\//g, "+"));
  }

  private _getMIMETypeMappingPath(): string {
    return this._getStorePath("+mimeTypeMapping");
  }

  private async _writeMIMETypeMapping(
    subpath: string,
    mimeType: string,
  ): Promise<void> {
    await fs.promises.appendFile(
      this._getMIMETypeMappingPath(),
      `${subpath}::${mimeType}\n`,
      "utf8",
    );
  }

  private async _getMIMETypeMapping(subpath: string): Promise<string | null> {
    const mappingContents = await fs.promises
      .readFile(this._getMIMETypeMappingPath(), "utf8")
      .catch(() => "");
    const lines = mappingContents.split("\n").reverse();
    for (const line of lines) {
      const components = line.split("::");
      if (components[0] === subpath) {
        return components[1];
      }
    }
    return null;
  }
}
