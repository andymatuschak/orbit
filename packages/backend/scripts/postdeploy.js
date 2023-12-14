// See predeploy.js for more details.
import fs from "fs";
import { firebaseJSONPath, isolatedPath } from "./deployShared.js";
import { execSync } from "child_process";

// Restore the firebase configuration file.
fs.renameSync(`${firebaseJSONPath}.bak`, firebaseJSONPath);

// We also need to remove the isolated package directory.
fs.rmSync(isolatedPath, { recursive: true, force: true });

// Git status should be clean again.
const gitStatus = execSync("git status --porcelain").toString();
if (gitStatus !== "") {
  throw new Error(
    "git status is not clean after cleaning up deployment... unexpected!",
  );
}
