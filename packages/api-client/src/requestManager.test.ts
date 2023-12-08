import { RequestManager } from "./requestManager.js";
import { MockOrbitAPIValidation } from "./util/mockAPIValiation.js";

const testAPIConfig = { baseURL: "https://localhost" };

describe("URL parameter interpolation", () => {
  type TestAPI = {
    "/foo/:bar/baz/:bat": {
      GET: {
        params: {
          bar: string;
          bat: number;
        };
        response: void;
      };
    };
    "/ordinary": {
      GET: { response: void };
    };
  };
  const mockedValidator = new MockOrbitAPIValidation();
  const requestManager = new RequestManager<TestAPI>(
    testAPIConfig,
    mockedValidator,
  );

  test("interpolates parameters", () => {
    const url = requestManager.getRequestURL("/foo/:bar/baz/:bat", "GET", {
      params: { bar: "test", bat: 3 },
    });
    expect(url).toBe("https://localhost/foo/test/baz/3");
  });

  test("doesn't touch paths without params", () => {
    expect(requestManager.getRequestURL("/ordinary", "GET", {})).toBe(
      "https://localhost/ordinary",
    );
  });

  test("complains when parameters are missing", () => {
    expect(() =>
      requestManager.getRequestURL("/foo/:bar/baz/:bat", "GET", {
        // @ts-ignore
        params: { bar: "test" },
      }),
    ).toThrow();
  });

  test("complains when extra parameters are given", () => {
    expect(() =>
      requestManager.getRequestURL("/foo/:bar/baz/:bat", "GET", {
        // @ts-ignore
        params: { bar: "test", bat: 4, quux: 10 },
      }),
    ).toThrow();
  });
});
