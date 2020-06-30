import { Buffer } from "buffer";
import crypto from "crypto";

// This one's marked as async becuase the .web variant actually is async.
export default async function sha256(data: Uint8Array): Promise<Buffer> {
  return crypto.createHash("sha256").update(data).digest();
}
