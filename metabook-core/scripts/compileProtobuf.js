const { pbjs, pbts } = require("protobufjs/cli"); // or require("protobufjs/cli").pbjs / .pbts
const path = require("path");

const protobufPath = path.join(__dirname, "../src/identifiers/metabook.proto");
const outputPath = path.join(
  __dirname,
  "../src/identifiers/generated/proto.js",
);
const outputTypesPath = path.join(
  __dirname,
  "../src/identifiers/generated/proto.d.ts",
);

pbjs.main(
  ["-t", "static-module", "-w", "commonjs", "-o", outputPath, protobufPath],
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
