// Each function exported by this module corresponds to a Firebase cloud function. Firebase will provision cloud functions accordingly.
export { default as onUserCreate } from "./firebaseFunctions/onUserCreate.js";
export { updateNotificationSettings } from "./firebaseFunctions/updateNotificationSettings.js";

export { api } from "./firebaseFunctions/api.js";

export * from "./firebaseFunctions/notifier/index.js";
