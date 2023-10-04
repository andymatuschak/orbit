import * as firebaseTesting from "@firebase/rules-unit-testing";
import childProcess, { ChildProcess } from "child_process";
import events from "events";
import firebase from "firebase-admin";
import path from "path";
import { resetLocalEmulators } from "./emulators";

const projectID = "metabook-system";

let emulatorProcess: ChildProcess | null = null;

export function startFirebaseTestingEmulator() {
  if (emulatorProcess) {
    throw new Error("Emulator process already started");
  }

  console.log(`Starting emulator in ${path.resolve(__dirname, "..")}`);
  const localEmulatorProcess = childProcess.spawn(
    "npx",
    ["firebase", "emulators:start"],
    {
      cwd: path.resolve(__dirname, ".."),
    },
  );
  emulatorProcess = localEmulatorProcess;

  process.env["FIRESTORE_EMULATOR_HOST"] = "127.0.0.1:8080";

  return new Promise((resolve) => {
    localEmulatorProcess.stdout.on("data", async (data) => {
      console.log(data.toString());
      if (/All emulators ready/.test(data.toString())) {
        // Clear any data that may have been left over from prior runs (e.g. if they didn't terminate cleanly).
        await firebaseTesting.clearFirestoreData({ projectId: projectID });
        resolve(undefined);
      }
    });

    localEmulatorProcess.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
    });
  });
}

export async function stopFirebaseTestingEmulator() {
  if (emulatorProcess) {
    emulatorProcess?.kill("SIGINT");
    const code = await events.once(emulatorProcess, "close");
    console.log(`firebase process exited: ${code}`);
    emulatorProcess = null;
  }
}

export function createTestAdminFirebaseApp(): firebase.app.App {
  return firebaseTesting.initializeAdminApp({
    projectId: projectID,
  });
}

export async function terminateTestFirebaseApp(app: firebase.app.App) {
  await app.firestore().terminate();
  await app.delete();
  await resetLocalEmulators();
}

export async function clearFirestoreData() {
  await firebaseTesting.clearFirestoreData({ projectId: projectID });
}
