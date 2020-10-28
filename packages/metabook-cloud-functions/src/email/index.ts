import functions from "firebase-functions";
import MailjetEmailService from "./mailjet";
import { EmailService } from "./types";

let _mailjetService: MailjetEmailService | null = null;
export default function getDefaultEmailService(): EmailService {
  if (!_mailjetService) {
    _mailjetService = new MailjetEmailService(
      functions.config().mailjet.api_key,
      functions.config().mailjet.secret_key,
    );
  }
  return _mailjetService;
}
