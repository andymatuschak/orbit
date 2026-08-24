import {
  createIngestibleValidator,
  Ingestible,
  ingestSources,
  MissingItemIdentifierError,
} from "@withorbit/ingester";
import { OrbitStore } from "@withorbit/store-shared";
import { createDefaultOrbitStore } from "../../model2/orbitStoreFactory.js";

export type IngestEventInput = {
  json: string;
};

export type IngestEventResult =
  | { status: "succeeded" }
  | { status: "permanent-failure"; message: string }
  | { status: "retryable-failure"; message: string };

const validator = createIngestibleValidator({ mutateWithDefaultValues: true });

function describeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function findDuplicateItemIdentifier(ingestible: Ingestible) {
  const identifiers = new Set<string>();
  for (const source of ingestible.sources) {
    for (const item of source.items) {
      if (identifiers.has(item.identifier)) {
        return item.identifier;
      }
      identifiers.add(item.identifier);
    }
  }
  return undefined;
}

export async function handleIngestEventWithDefaultStore(
  event: IngestEventInput,
): Promise<IngestEventResult> {
  let store: OrbitStore;
  try {
    store = await createDefaultOrbitStore();
  } catch (error) {
    console.error(error);
    return {
      status: "retryable-failure",
      message: `Orbit couldn't open its database: ${describeError(error)}`,
    };
  }
  return handleIngestEvent(store, event);
}

export async function handleIngestEvent(
  store: OrbitStore,
  event: IngestEventInput,
): Promise<IngestEventResult> {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(event.json);
  } catch (error) {
    const message = `The selected file isn't valid JSON: ${describeError(error)}`;
    console.error(message);
    return { status: "permanent-failure", message };
  }

  const { isValid, errors } = validator.validate(parsedJson);
  if (!isValid) {
    const message = `The selected file isn't a valid Orbit Ingestible: ${JSON.stringify(errors)}`;
    console.error(message);
    return { status: "permanent-failure", message };
  }

  const ingestibleSources = parsedJson as Ingestible;
  const duplicateItemIdentifier = findDuplicateItemIdentifier(ingestibleSources);
  if (duplicateItemIdentifier !== undefined) {
    return {
      status: "permanent-failure",
      message: `The selected file contains the item identifier '${duplicateItemIdentifier}' more than once.`,
    };
  }

  let events;
  try {
    events = await ingestSources(ingestibleSources.sources, store);
  } catch (error) {
    console.error(error);
    const message = `Orbit couldn't prepare the import: ${describeError(error)}`;
    return error === MissingItemIdentifierError
      ? { status: "permanent-failure", message }
      : { status: "retryable-failure", message };
  }

  try {
    await store.database.putEvents(events);
    return { status: "succeeded" };
  } catch (error) {
    console.error(error);
    return {
      status: "retryable-failure",
      message: `Orbit couldn't finish the import: ${describeError(error)}`,
    };
  }
}
