import serviceConfig from "../serviceConfig.js";
import { isRunningInEmulator } from "../util/isRunningInEmulator.js";
import { dummyEmailService } from "./dummy.js";
import MailjetEmailService from "./mailjet.js";
import { EmailService } from "./types.js";

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
