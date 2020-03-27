/// <reference types="node" />
import childProcess, { ChildProcess } from "child_process";
import events from "events";
import path from "path";

let emulatorProcess: ChildProcess | null = null;

export function startFirebaseTestingEmulator() {
  if (emulatorProcess) {
    throw new Error("Emulator process already started");
  }

  const localEmulatorProcess = childProcess.spawn(
    "firebase",
    ["emulators:start", "--only", "firestore"],
    {
      cwd: path.resolve(__dirname, "../../.."),
    },
  );
  emulatorProcess = localEmulatorProcess;

  return new Promise((resolve) => {
    localEmulatorProcess.stdout.on("data", (data) => {
      console.log(data.toString());
      if (/Emulator started/.test(data.toString())) {
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
