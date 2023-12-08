import { LoggingService } from "./interface.js";

function createTracer(name: string) {
  return (...args: unknown[]) => {
    console.log("[Logging service]: ", name, ...args);
  };
}

export const dummyLoggingService = new Proxy(
  {},
  {
    get: function (_target, prop) {
      return createTracer(prop.toString());
    },
  },
) as LoggingService;
