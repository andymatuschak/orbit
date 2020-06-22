import { FirebaseTesting } from "metabook-firebase-support";

export default function () {
  return FirebaseTesting.stopFirebaseTestingEmulator();
}
