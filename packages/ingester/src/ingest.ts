import { ColorPaletteName, EntityType, Task } from "@withorbit/core";
import { DatabaseEntityQuery, OrbitStore } from "@withorbit/store-shared";

/**
 * @TJS-type string
 * @TJS-pattern ^[0-9a-zA-Z_\-]{22}$
 */
type IngestibleSourceIdentifier = string & {
  __sourceIDOpaqueType: never;
};

export interface IngestibleSource {
  // unique identifier representing a source which tasks might share, used for clustering; can be a URL or an arbitrary UUID
  identifier: IngestibleSourceIdentifier;
  // title that can be used when displaying the source.
  title: string;
  // prompts associated with the given source
  prompts: IngestiblePrompt[];
  // an optional URL to open when the user indicates they'd like to navigate to the provenance of the task
  url?: string;
  // an optional const that can be used to customize the visual appearance of the source during review
  colorPaletteName?: ColorPaletteName;
}

type IngestiblePrompt = IngestibleQAPrompt;

export interface IngestibleQAPrompt {
  body: { text: string };
  answer: { text: string };
}

export async function ingestSources(
  sources: IngestibleSource[],
  store: OrbitStore,
) {
  const query: DatabaseEntityQuery<Task> = {
    entityType: EntityType.Task,
  };
  const entities = await store.database.listEntities(query);
  console.log(entities);
}
