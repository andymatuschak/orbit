export class AttachmentDownloadError extends Error {
  private statusCode: number;
  private bodyText?: string;

  constructor({
    statusCode,
    bodyText,
  }: {
    statusCode: number;
    bodyText?: string;
  }) {
    super(`HTTP request failed (status: ${statusCode}): ${bodyText}`);
    this.statusCode = statusCode;
    this.bodyText = bodyText;
  }
}
