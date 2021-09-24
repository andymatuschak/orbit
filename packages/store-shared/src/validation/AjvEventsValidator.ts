import { Event } from "@withorbit/core";
import { EventsValidator, EventsValidatorError } from "./eventsValidator";
import Ajv, { ValidateFunction as AjvValidationFunction } from "ajv";
import DatabaseEventsSchema from "./events.json";

export class AjvEventsValidator implements EventsValidator {
  private readonly validator: AjvValidationFunction;

  constructor() {
    const ajv = new Ajv({
      allowUnionTypes: true,
      verbose: true,
    });
    this.validator = ajv.compile(DatabaseEventsSchema);
  }

  validateEvents(events: Event[]): EventsValidatorError | true {
    const isValidTypes = this.validator(events);
    if (isValidTypes !== true) {
      if (this.validator.errors) {
        return {
          errors: this.validator.errors.map((error) => ({
            message: `${error.schemaPath} ${error.message}`,
          })),
        };
      } else {
        return {
          errors: [{ message: "An unknown validation error occurred" }],
        };
      }
    }
    // TODO: validate the existence of IDs
    return true;
  }
}
