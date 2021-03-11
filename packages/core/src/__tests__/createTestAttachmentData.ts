export default function createTestAttachmentData(string: string): Uint8Array {
  const buffer = Buffer.from(string);
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
