import { EmailService, EmailSpec } from "./types.js";

export const dummyEmailService: EmailService = {
  async sendEmail(
    recipientEmailAddress: string,
    spec: EmailSpec,
  ): Promise<void> {
    console.log(`[Email service]:
  To: ${recipientEmailAddress}
  Subject: ${spec.subject}
  Plaintext:
${spec.text}

  HTML:
${spec.html}

  =========`);
  },
};
