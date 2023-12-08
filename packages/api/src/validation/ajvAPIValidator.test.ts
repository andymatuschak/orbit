import { Schema } from "ajv";
import { AjvAPIValidator } from "./ajvAPIValidator.js";

type Apple = { isSliced: boolean };
type Flour = { mass: number };
type MockSpec = {
  "/basket": {
    GET: {
      query: { limit: number };
      response: (Apple | Flour)[];
    };
  };
  "/items": {
    PATCH: {
      body: { ids: string[] };
      response: null;
    };
  };
};

const mockSchema: Schema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  additionalProperties: false,
  properties: {
    "/basket": {
      type: "object",
      additionalProperties: false,
      properties: {
        GET: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: {
              type: "object",
              additionalProperties: false,
              properties: {
                limit: {
                  default: 100,
                  minimum: 1,
                  type: "integer",
                },
              },
            },
            response: {
              type: "array",
              items: {
                anyOf: [
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      isSliced: { type: "boolean" },
                    },
                  },
                  {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                      mass: { type: "number" },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
    "/items": {
      type: "object",
      additionalProperties: false,
      properties: {
        PATCH: {
          type: "object",
          additionalProperties: false,
          properties: {
            body: {
              type: "object",
              additionalProperties: false,
              properties: {
                ids: {
                  items: { type: "string" },
                  type: "array",
                },
              },
              required: ["ids"],
            },
            response: { type: "null" },
          },
        },
      },
    },
  },
};

describe("AjvAPIValidator", () => {
  const config = {
    allowUnsupportedRoute: true,
    mutateWithDefaultValues: true,
  };
  const validator = new AjvAPIValidator<MockSpec>(config, mockSchema);

  it("mutates request query with default value", () => {
    const query = {};
    const result = validator.validateRequest({
      path: "/basket",
      method: "GET",
      query,
    });
    expect(result).toEqual(true);
    expect(query).toEqual({ limit: 100 });
  });

  it("mutates response query with default value", () => {
    const query = {};
    const result = validator.validateResponse(
      {
        path: "/basket",
        method: "GET",
        query,
      },
      [{ isSliced: true }],
    );
    expect(result).toEqual(true);
    expect(query).toEqual({ limit: 100 });
  });

  it("allows unsupported routes when the option is enabled", () => {
    const result = validator.validateRequest({
      path: "/someRandomRoute",
      method: "GET",
      query: {},
    });
    expect(result).toEqual(true);
  });

  it("fails for unsupported routes when the option is enabled", () => {
    const doNotAllowUnsupportedRoute = new AjvAPIValidator<MockSpec>(
      { ...config, allowUnsupportedRoute: false },
      mockSchema,
    );
    const result = doNotAllowUnsupportedRoute.validateRequest({
      path: "/someRandomRoute",
      method: "GET",
      query: {},
    });
    expect(result).toMatchObject({
      errors: [{ message: " must NOT have additional properties" }],
    });
  });

  it("fails for unsupported methods", () => {
    const result = validator.validateRequest({
      path: "/basket",
      method: "POST",
      query: {},
    });
    expect(result).toMatchObject({
      errors: [{ message: "~1basket must NOT have additional properties" }],
    });
  });

  it("strips error message instance path", () => {
    const query = { limit: 3.14 };
    const result = validator.validateResponse(
      {
        path: "/basket",
        method: "GET",
        query,
      },
      [{ isSliced: true }],
    );
    expect(result).toMatchObject({
      errors: [{ message: "query/limit must be integer" }],
    });
  });

  it("coerces integer type from string values", () => {
    const query = { limit: "3" };
    const result = validator.validateResponse(
      {
        path: "/basket",
        method: "GET",
        query,
      },
      [{ isSliced: true }],
    );
    expect(result).toEqual(true);
  });

  it("coerces boolean type from string values", () => {
    const result = validator.validateResponse(
      {
        path: "/basket",
        method: "GET",
        query: {},
      },
      [{ isSliced: "true" }],
    );
    expect(result).toEqual(true);
  });

  it("coerces array type from a single string value", () => {
    const body = { ids: "id1" };
    const result = validator.validateResponse(
      {
        path: "/items",
        method: "PATCH",
        body,
      },
      null,
    );
    expect(result).toEqual(true);
    expect(body).toEqual({ ids: ["id1"] });
  });
});
