import serviceConfig from "../serviceConfig";
import { isRunningInEmulator } from "../util/isRunningInEmulator";
import { dummyEmailService } from "./dummy";
import MailjetEmailService from "./mailjet";
import { EmailService } from "./types";

let _sharedEmailService: EmailService | null = null;
export default function getDefaultEmailService(): EmailService {
  if (!_sharedEmailService) {
    _sharedEmailService = isRunningInEmulator
      ? dummyEmailService
      : new MailjetEmailService(
          serviceConfig.mailjet.apiKey,
          serviceConfig.mailjet.secretKey,
        );
  }
  return _sharedEmailService;
}
