import mailjet from "node-mailjet";
import serviceConfig from "../serviceConfig.js";
import { EmailService, EmailSpec } from "./types.js";

const testingMode = false;

export default class MailjetEmailService implements EmailService {
  private mailjetClient: mailjet.Email.Client;

  constructor(apiKey: string, secretKey: string) {
    this.mailjetClient = mailjet.connect(apiKey, secretKey);
  }

  async sendEmail(
    recipientEmailAddress: string,
    spec: EmailSpec,
  ): Promise<unknown> {
    const { subject, text, html } = spec;
    if (testingMode) {
      console.log(
        `[Suppressing emails]. Would have sent to ${recipientEmailAddress}:\nSubject: ${subject}\n${text}\n\nHTML:\n\n${html}`,
      );
    } else {
      return this.mailjetClient.post("send", { version: "v3.1" }).request({
        Messages: [
          {
            From: {
              Email: serviceConfig.notificationEmails.sender.email,
              Name: serviceConfig.notificationEmails.sender.name,
            },
            ReplyTo: {
              Email: serviceConfig.notificationEmails.replyTo.email,
              Name: serviceConfig.notificationEmails.replyTo.name,
            },
            To: [
              {
                Email: recipientEmailAddress,
              },
            ],
            Subject: subject,
            TextPart: text,
            HTMLPart: html,
          },
        ],
      });
    }
  }
}
