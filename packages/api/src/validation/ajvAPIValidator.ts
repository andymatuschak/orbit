import Ajv, {
  ErrorObject as AjvErrorObject,
  Schema as AjvSchema,
  ValidateFunction as AjvValidationFunction,
} from "ajv";
import {
  APIValidatorRequest,
  APIValidatorError,
  APIValidator,
} from "./apiValidator";

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
      // coerce numbers, boolean values AND array
      coerceTypes: "array",
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
    { method, path, query, body }: APIValidatorRequest,
    response: unknown,
  ) {
    const isValid = this.validator({
      [path]: {
        [method]: {
          ...(method === "GET" ? { query } : { body: body }),
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
      return this.validator.errors[0].schemaPath === "#/additionalProperties";
    }
    return false;
  }

  private _createAPIValidationError(error: AjvErrorObject) {
    // Assume the format is /#/properties/[HTTP_PATH]/properties/[VERB]/properties/query/*;
    // strip everything up to query
    const isolatedInstancePath = error.schemaPath.split("/").slice(6).join("/");

    return {
      message: `${isolatedInstancePath} ${error.message}`,
    };
  }
}
