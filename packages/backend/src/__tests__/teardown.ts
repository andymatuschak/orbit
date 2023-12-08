import { stopLocalEmulators } from "./emulators.js";

export default async function () {
  await stopLocalEmulators();
}
