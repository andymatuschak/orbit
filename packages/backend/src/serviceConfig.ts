import { isRunningInEmulator } from "./util/isRunningInEmulator";
import { isRunningInTest } from "./util/isRunningInTest";

const shouldMockValue = isRunningInEmulator || isRunningInTest;
const functions = shouldMockValue ? null : require("firebase-functions");

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

  sessionIDHashSalt: shouldMockValue
    ? "emulator-session-salt"
    : functions.config().logging.session_id_hash_salt,
  mailjet: {
    apiKey: shouldMockValue ? null : functions.config().mailjet.api_key,
    secretKey: shouldMockValue ? null : functions.config().mailjet.secret_key,
  },
};

export default serviceConfig;
