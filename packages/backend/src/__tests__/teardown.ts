import { stopLocalEmulators } from "./emulators";

export default async function () {
  await stopLocalEmulators();
}
