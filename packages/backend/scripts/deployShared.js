import path from "path";

export const packageRoot = path.join(import.meta.dir, "..");
export const firebaseJSONPath = path.join(packageRoot, "firebase.json");
export const isolatedFolderName = "isolate";
export const isolatedPath = path.join(packageRoot, isolatedFolderName);
