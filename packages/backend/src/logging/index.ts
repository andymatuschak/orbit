import { isRunningInEmulator } from "../util/isRunningInEmulator.js";
import { bigQueryLoggingService } from "./bigQuery.js";
import { dummyLoggingService } from "./dummy.js";
import { LoggingService } from "./interface.js";

let sharedLoggingService: LoggingService = isRunningInEmulator
  ? dummyLoggingService
  : bigQueryLoggingService;
export { sharedLoggingService };

// i.e. for tests
export function _overrideSharedLoggingService(loggingService: LoggingService) {
  sharedLoggingService = loggingService;
}
