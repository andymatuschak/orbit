export type APIValidatorRequest = {
  method: string;
  path: string;
  contentType?: string;
  query?: unknown;
  body?: unknown;
};

export type APIValidatorError = {
  errors: { message: string }[];
};

export interface APIValidator {
  validateRequest(request: APIValidatorRequest): APIValidatorError | true;
  validateResponse(
    request: APIValidatorRequest,
    response: unknown,
  ): APIValidatorError | true;
}
