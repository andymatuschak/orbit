import * as functions from "firebase-functions";
import { isRunningInEmulator } from "./util/isRunningInEmulator";

const serviceConfig = {
  notificationEmails: {
    sender: {
      email: "notifications@withorbit.com",
      name: "Orbit",
    },
    replyTo: {
      email: "contact@withorbit.com",
      name: "Andy Matuschak (Orbit author)",
    },
  },
  bigQuery: {
    logDatasetName: "logs",
    projectId: "metabook-system",
  },
  webBaseURL: "https://withorbit.com",

  sessionIDHashSalt: isRunningInEmulator ? "emulator-session-salt" : functions.config().logging.session_id_hash_salt,
  mailjet: {
    apiKey: isRunningInEmulator ? null : functions.config().mailjet.api_key,
    secretKey: isRunningInEmulator ? null : functions.config().mailjet.secret_key,
  },
};

export default serviceConfig;
