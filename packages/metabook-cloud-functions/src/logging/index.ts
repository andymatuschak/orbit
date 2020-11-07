import { isRunningInEmulator } from "../util/isRunningInEmulator";
import { bigQueryLoggingService } from "./bigQuery";
import { dummyLoggingService } from "./dummy";
import { LoggingService } from "./interface";

let sharedLoggingService: LoggingService = isRunningInEmulator
  ? dummyLoggingService
  : bigQueryLoggingService;
export { sharedLoggingService };

// i.e. for tests
export function _overrideSharedLoggingService(loggingService: LoggingService) {
  sharedLoggingService = loggingService;
}
