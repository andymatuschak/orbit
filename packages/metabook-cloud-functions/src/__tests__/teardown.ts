require("ts-node").register("../../tsconfig.json");

const { FirebaseTesting } = require("metabook-firebase-support");

export default function () {
  return FirebaseTesting.stopFirebaseTestingEmulator();
}
