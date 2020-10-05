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
};

export default serviceConfig;
