import AjvModule from "ajv";
import schema from "./ingestible.json" assert { type: "json" };
import { Ingestible } from "./ingestible.js";

// FIXME: https://github.com/ajv-validator/ajv/issues/2047
const Ajv = AjvModule.default;

type ValidationError = { path: string; message: string | null };
export interface IngestibleValidator {
  validate(value: unknown): {
    isValid: boolean;
    errors: ValidationError[] | null;
  };
}

export function createIngestibleValidator(config: {
  mutateWithDefaultValues: boolean;
}): IngestibleValidator {
  const ajv = new Ajv({
    allowUnionTypes: true,
    useDefaults: config.mutateWithDefaultValues,
    // Coerce incoming values to the schema-specified types. When the schema
    // specifies an array type, it will map x to [x] as needed.
    //
    // ex: let ids be defined as an array in the schema
    // a value of { ids: "idA" } will be coerced to { ids: ["idA"] }
    coerceTypes: "array",
    verbose: true,
  });

  const validator = ajv.compile<Ingestible>(schema);
  return {
    validate: (value) => {
      const isValid = validator(value);
      const errors = validator.errors?.map((err) => ({
        path: err.instancePath,
        message: err.message ?? null,
      }));

      return { isValid, errors: errors ?? null };
    },
  };
}
