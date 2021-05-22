import { APIValidator } from "@withorbit/api";

export class MockOrbitAPIValidation implements APIValidator {
  validateRequest(): true {
    return true;
  }

  validateResponse(): true {
    return true;
  }
}
