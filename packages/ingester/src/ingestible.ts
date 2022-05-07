import { ColorPaletteName, TaskSpec } from "@withorbit/core";

export type Ingestible = {
  sources: IngestibleSource[];
};

/**
 * @TJS-type string
 */
export type IngestibleSourceIdentifier = string & {
  __sourceIDOpaqueType: never;
};

export interface IngestibleSource {
  // unique identifier representing a source which tasks might share, used for clustering; can be a URL or an arbitrary UUID
  identifier: IngestibleSourceIdentifier;
  // title that can be used when displaying the source.
  title: string;
  // items associated with the given source
  items: IngestibleItem[];
  // an optional URL to open when the user indicates they'd like to navigate to the provenance of the task
  url?: string;
  // an optional const that can be used to customize the visual appearance of the source during review
  colorPaletteName?: ColorPaletteName;
}

/**
 * @TJS-type string
 */
export type IngestibleItemIdentifier = string & {
  __sourceIDOpaqueType: never;
};

export type IngestibleItem = {
  identifier: IngestibleItemIdentifier;
  spec: TaskSpec;
};
