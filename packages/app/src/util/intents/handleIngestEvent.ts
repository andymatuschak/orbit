import {
  createIngestibleValidator,
  Ingestible,
  ingestSources,
} from "@withorbit/ingester";
import { OrbitStore } from "@withorbit/store-shared";
import { NativeModule } from "react-native";
import { createDefaultOrbitStore } from "../../model2/orbitStoreFactory.js";

export type IngestEventEmitterType = {
  completedIngestion(val: boolean): void;
} & NativeModule;

type IngestEventInput = {
  json: string;
};

const validator = createIngestibleValidator({ mutateWithDefaultValues: true });

export function handleIngestEventWithDefaultStore(
  emitter: IngestEventEmitterType,
) {
  return async (event: IngestEventInput) => {
    const store = await createDefaultOrbitStore();
    return handleIngestEvent(emitter, store, event);
  };
}

export async function handleIngestEvent(
  emitter: IngestEventEmitterType,
  store: OrbitStore,
  event: IngestEventInput,
) {
  try {
    const parsedJson = JSON.parse(event.json);
    const { isValid, errors } = validator.validate(parsedJson);
    if (!isValid) {
      console.error(errors);
      throw new Error(`File is not valid: ${errors}`);
    }
    const ingestibleSources = parsedJson as Ingestible;
    const events = await ingestSources(ingestibleSources.sources, store);
    await store.database.putEvents(events);
    emitter.completedIngestion(true);
  } catch (error) {
    console.error(error);
    emitter.completedIngestion(false);
  }
}
