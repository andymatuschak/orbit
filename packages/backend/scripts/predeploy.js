// Firebase cloud function deployment doesn't really support monorepos: the environment won't have access to the other packages.
// So we use a tool called "isolate", which produces a special isolated version of the backend package.
// See https://github.com/0x80/isolate-package#lockfiles.
import { execSync } from "child_process";
import path from "path";
import fs from "fs";
import {
  firebaseJSONPath,
  isolatedFolderName,
  isolatedPath,
  packageRoot,
} from "./deployShared.js";

const workspaceRoot = path.join(packageRoot, "../..");
if (fs.existsSync(isolatedPath)) {
  throw new Error("isolate directory already exists--clear it first");
}

// Ensure that git is clean:
const gitStatus = execSync("git status --porcelain").toString();
if (gitStatus !== "") {
  throw new Error("git status is not clean");
}

// Produce a yarn-compatible lockfile we can use to pin our dependency versions:
execSync("bun install -y");

execSync("bunx isolate");

// Move our yarn lockfile to the isolated package directory.
execSync(`mv ${path.join(workspaceRoot, "yarn.lock")} ${isolatedPath}`);

// Re-run yarn against that package to remove any dependencies in that lockfile which aren't used by this package and its dependencies (otherwise the deploy will fail).
execSync(`yarn --cwd ${isolatedPath} install`);

// Rewrite firebase.json to point to the isolated output.
fs.copyFileSync(firebaseJSONPath, `${firebaseJSONPath}.bak`);
const firebaseJSON = JSON.parse(fs.readFileSync(firebaseJSONPath, "utf-8"));
firebaseJSON.functions.source = `./${isolatedFolderName}`;
fs.writeFileSync(firebaseJSONPath, JSON.stringify(firebaseJSON), "utf-8");
