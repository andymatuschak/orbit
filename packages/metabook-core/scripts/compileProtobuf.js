const { pbjs, pbts } = require("protobufjs/cli"); // or require("protobufjs/cli").pbjs / .pbts
const path = require("path");

const protobufPaths = [
  path.join(__dirname, "../src/promptID/promptID.proto"),
  path.join(__dirname, "../src/actionLogID/actionLogID.proto"),
];
const outputPath = path.join(__dirname, "../src/generated/proto.js");
const outputTypesPath = path.join(__dirname, "../src/generated/proto.d.ts");

pbjs.main(
  ["-t", "static-module", "-w", "commonjs", "-o", outputPath, ...protobufPaths],
  (err, output) => {
    if (err) {
      throw err;
    }

    pbts.main(["-o", outputTypesPath, outputPath], (err, output) => {
      if (err) {
        throw err;
      }
      process.exit(0);
    });
  },
);
