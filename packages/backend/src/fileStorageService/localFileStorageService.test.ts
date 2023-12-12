import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { resetLocalFileServiceData } from "../__tests__/emulators.js";
import { LocalFileStorageService } from "./localFileStorageService.js";

afterEach(async () => {
  await resetLocalFileServiceData();
});

let service: LocalFileStorageService;
beforeEach(async () => {
  const localFileServicePath = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "orbit-test-"),
  );

  service = new LocalFileStorageService(localFileServicePath);
});

describe("file storage", () => {
  const subpath = "foo/bar.txt";
  const contents = Buffer.from("Test");
  beforeEach(async () => {
    await service.storeFile(subpath, contents, "plain/text");
  });

  test("round trips", async () => {
    expect(
      await fs.promises.readFile(fileURLToPath(service.formatURL(subpath))),
    ).toEqual(contents);
  });

  test("reports existence", async () => {
    expect(await service.fileExists(subpath)).toBe(true);
  });

  test("saves MIME type", async () => {
    expect(await service.getMIMEType(subpath)).toEqual("plain/text");
  });

  test("copyFile", async () => {
    await service.copyFile(subpath, "another.txt");
    expect(
      await fs.promises.readFile(
        fileURLToPath(service.formatURL("another.txt")),
      ),
    ).toEqual(contents);
    expect(await service.getMIMEType(subpath)).toEqual("plain/text");
  });
});

test("missing files don't exist", async () => {
  expect(await service.fileExists("foo")).toBe(false);
  expect(await service.getMIMEType("foo")).toBeNull();
});
