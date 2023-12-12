import AjvModule, {
  ErrorObject as AjvErrorObject,
  Schema as AjvSchema,
  ValidateFunction as AjvValidationFunction,
} from "ajv";
import {
  APIValidatorRequest,
  APIValidatorError,
  APIValidator,
} from "./apiValidator.js";

// TODO: remove when https://github.com/ajv-validator/ajv/issues/2047 is fixed
const Ajv = AjvModule.default;

export type AjvAPIValidatorConfig = {
  mutateWithDefaultValues: boolean;
  allowUnsupportedRoute: boolean;
};

export class AjvAPIValidator<T extends AjvSchema> implements APIValidator {
  private readonly validator: AjvValidationFunction;
  private readonly config: AjvAPIValidatorConfig;

  constructor(config: AjvAPIValidatorConfig, schema: AjvSchema) {
    this.config = config;
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
    this.validator = ajv.compile<T>(schema);
  }

  validateRequest(request: APIValidatorRequest): APIValidatorError | true {
    return this.validate(request, undefined);
  }

  validateResponse(
    request: APIValidatorRequest,
    response: unknown,
  ): APIValidatorError | true {
    return this.validate(request, response);
  }

  private validate(
    { method, path, contentType, query, body, params }: APIValidatorRequest,
    response: unknown,
  ) {
    // helper to make sure that objects are not empty
    const nullIfEmpty = (obj: Record<string, unknown> | undefined) => {
      if (!obj) return null;
      if (Object.keys(obj).length === 0) return null;
      return obj;
    };

    const isValid = this.validator({
      [path]: {
        [method]: {
          ...(method === "GET" ? { query } : { body: body }),
          ...(nullIfEmpty(params) && { params }),
          ...(contentType && { contentType }),
          response,
        },
      },
    });

    if (
      isValid ||
      (this.config.allowUnsupportedRoute && this._isUnsupportedRoute())
    ) {
      return true;
    } else if (this.validator.errors) {
      return {
        errors: this.validator.errors.map(this._createAPIValidationError),
      };
    } else {
      return {
        errors: [{ message: "An unknown validation error occurred" }],
      };
    }
  }

  private _isUnsupportedRoute(): boolean {
    if (this.validator.errors) {
      return (
        this.validator.errors[0].instancePath === "" &&
        this.validator.errors[0].schemaPath == "#/additionalProperties"
      );
    }
    return false;
  }

  private _createAPIValidationError(error: AjvErrorObject) {
    // Assume the format is /#/properties/[HTTP_PATH]/properties/[VERB]/properties/query/*;
    // strip everything up to query
    const splitInstancePath = error.instancePath.split("/");
    const isolatedInstancePath: string = splitInstancePath
      .slice(Math.min(splitInstancePath.length - 1, 3))
      .join("/");

    return {
      message: `${isolatedInstancePath} ${error.message}`,
      data: error.data,
    };
  }
}
