export interface EmailService {
  sendEmail(recipientEmailAddress: string, spec: EmailSpec): Promise<unknown>;
}

export interface EmailSpec {
  subject: string;
  text: string;
  html?: string;
}
