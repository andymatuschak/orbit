import bigQuery from "./bigQuery";
import { LoggingService } from "./interface";

let defaultLoggingService = bigQuery;
export { defaultLoggingService };

// i.e. for tests
export function _overrideDefaultLoggingService(loggingService: LoggingService) {
  defaultLoggingService = loggingService;
}
