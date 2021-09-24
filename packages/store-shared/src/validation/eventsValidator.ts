import { Event } from "@withorbit/core";

type Events = Event[];

export type EventsValidatorError = {
  errors: { message: string }[];
};

export interface EventsValidator {
  validateEvents(events: Events): EventsValidatorError | true;
}
