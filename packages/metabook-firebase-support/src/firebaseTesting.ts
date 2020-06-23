/// <reference types="node" />
import * as firebaseTesting from "@firebase/testing";
import childProcess, { ChildProcess } from "child_process";
import events from "events";
import firebase from "firebase";
import path from "path";

const projectID = "metabook-system";
const functionsEmulatorURL = "http://localhost:5001";

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

  return new Promise((resolve) => {
    localEmulatorProcess.stdout.on("data", (data) => {
      console.log(data.toString());
      if (/All emulators ready/.test(data.toString())) {
        resolve();
      }
    });

    localEmulatorProcess.stderr.on("data", (data) => {
      console.error(`stderr: ${data}`);
      // fail("Couldn't start Firebase emulator");
      // reject();
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

export function createTestFirebaseApp(
  uid = "testUserID",
  email = "test@test.com",
): {
  firestore: firebase.firestore.Firestore;
  functions: firebase.functions.Functions;
} {
  const testApp = firebaseTesting.initializeTestApp({
    projectId: projectID,
    auth: { uid, email },
  });
  const testFunctions = testApp.functions();
  testFunctions.useFunctionsEmulator(functionsEmulatorURL);
  return { firestore: testApp.firestore(), functions: testFunctions };
}

export function createTestAdminFirebaseApp(): {
  firestore: firebase.firestore.Firestore;
  functions: firebase.functions.Functions;
} {
  const testApp = firebaseTesting.initializeAdminApp({
    projectId: projectID,
  });
  const testFunctions = testApp.functions();
  testFunctions.useFunctionsEmulator(functionsEmulatorURL);
  return { firestore: testApp.firestore(), functions: testFunctions };
}

export async function resetTestFirestore(
  firestore: firebase.firestore.Firestore,
) {
  await firestore.terminate();
  await firestore.clearPersistence();
  await firebaseTesting.clearFirestoreData({ projectId: projectID });
}
