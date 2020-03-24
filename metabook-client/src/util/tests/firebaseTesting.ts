/// <reference types="node" />
import childProcess, { ChildProcess } from "child_process";

let emulatorProcess: ChildProcess | null = null;

export function startFirebaseTestingEmulator() {
  if (emulatorProcess) {
    throw new Error("Emulator process already started");
  }

  const localEmulatorProcess = childProcess.spawn("firebase", [
    "emulators:start",
    "--only",
    "firestore",
  ]);
  emulatorProcess = localEmulatorProcess;

  return new Promise(resolve => {
    localEmulatorProcess.stdout.on("data", data => {
      console.log(data.toString());
      if (/Emulator started/.test(data.toString())) {
        resolve();
      }
    });

    localEmulatorProcess.stderr.on("data", data => {
      console.error(`stderr: ${data}`);
      // fail("Couldn't start Firebase emulator");
      // reject();
    });
  });
}

export function stopFirebaseTestingEmulator() {
  return new Promise(resolve => {
    if (emulatorProcess) {
      emulatorProcess?.kill("SIGINT");
      emulatorProcess?.on("close", code => {
        console.log(`child process exited with code ${code}`);
        emulatorProcess = null;
        resolve();
      });
    } else {
      resolve();
    }
  });
}
