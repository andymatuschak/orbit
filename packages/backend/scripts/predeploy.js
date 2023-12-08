// Firebase cloud function deployment doesn't really support monorepos: the environment won't have access to the other packages. So we bundle them into tarballs and ship them off to the cloud.
// Adapted from https://github.com/firebase/firebase-tools/issues/653#issuecomment-1731081401
import { execSync } from "child_process";
import path from "path";
import fs from "fs";

const tarballPath = path.join(import.meta.dir, "../deploy");
fs.mkdirSync(tarballPath, { recursive: true });

const packageNamesToFilenames = {};
const createTarballs = (packagePath) => {
  // Navigate to the folder in which the package is located
  process.chdir(path.join(import.meta.dir, packagePath), { recursive: true });

  const packageJSON = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const packageName = packageJSON.name;

  // Compile the package into JS and then pack it
  // This iwill create a .tgz (tarball) file inside the package folder
  execSync("npm run build && npm pack", { stdio: "inherit" });

  // Move the .tgz file to the functions folder
  const tgzFile = fs.readdirSync("./").find((file) => file.endsWith(".tgz"));
  if (tgzFile) {
    fs.renameSync(tgzFile, path.join(tarballPath, tgzFile));
    packageNamesToFilenames[packageName] = tgzFile;
  } else {
    throw new Error(`No tarball file found for ${packagePath}`);
  }
};

// Make sure the list in postdeploy.js matches.
let packagePaths = ["../../api", "../../core", "../../store-shared"];

packagePaths.forEach((p) => createTarballs(p));

const packageJsonPath = path.join(import.meta.dir, "../package.json");
const packageJsonData = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
for (const packageName of Object.keys(packageNamesToFilenames)) {
  packageJsonData.dependencies[
    packageName
  ] = `file:./deploy/${packageNamesToFilenames[packageName]}`;
}
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonData, null, 2));
