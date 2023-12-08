// Firebase cloud function deployment doesn't really support monorepos: the environment won't have access to the other packages. So we bundle them into tarballs and ship them off to the cloud. This postdeploy step undoes those changes.
// Adapted from https://github.com/firebase/firebase-tools/issues/653#issuecomment-1731081401
import fs from "fs";
import path from "path";

const packageJsonPath = path.join(import.meta.dir, "../package.json");
const packagesToRemove = [
  "@withorbit/api",
  "@withorbit/core",
  "@withorbit/store-shared",
];

const packageJsonData = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

// Remove the specified packages from dependencies
packagesToRemove.forEach((pkg) => {
  if (packageJsonData.dependencies && packageJsonData.dependencies[pkg]) {
    delete packageJsonData.dependencies[pkg];
  }
});

// Write the modified package.json back to disk
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJsonData, null, 2));

// Delete the .tgz files from the functions folder
fs.readdirSync(path.join(import.meta.dir, "../deploy")).forEach((file) => {
  if (file.endsWith(".tgz")) {
    fs.unlinkSync(path.join(__dirname, file));
  }
});
