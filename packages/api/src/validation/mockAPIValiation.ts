import { APIValidator } from "./apiValidator";

export class MockOrbitAPIValidation implements APIValidator {
  validateRequest(): true {
    return true;
  }

  validateResponse(): true {
    return true;
  }
}
