import { crypto as _crypto } from "./crypto.web.js";
export const crypto = _crypto;

if (!crypto.getRandomValues) {
  throw new Error(
    "Need to import react-native-get-random-values before importing this",
  );
}
if (!crypto.randomUUID) {
  throw new Error(
    "Need to import react-native-randomUUID before importing this",
  );
}
