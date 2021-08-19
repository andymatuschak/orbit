// Each function exported by this module corresponds to a Firebase cloud function. Firebase will provision cloud functions accordingly.
export { default as onUserCreate } from "./firebaseFunctions/onUserCreate";
export { onDataRecordCreate } from "./firebaseFunctions/onDataRecordCreate";
export { updateNotificationSettings } from "./firebaseFunctions/updateNotificationSettings";

export { api } from "./firebaseFunctions/api";

export * from "./firebaseFunctions/notifier";
