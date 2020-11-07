import * as functions from "firebase-functions";

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

  sessionIDHashSalt: functions.config().logging.session_id_hash_salt,
  mailjet: {
    apiKey: functions.config().mailjet.api_key,
    secretKey: functions.config().mailjet.secret_key,
  },
};

export default serviceConfig;
