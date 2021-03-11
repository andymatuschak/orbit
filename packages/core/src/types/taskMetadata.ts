import { PromptProvenanceType } from "./promptProvenance";

export interface TaskProvenance {
  provenanceType: PromptProvenanceType;
  externalID: string; // A unique identifier which specifies the source of this task relative to the provenanceType. For instance, for a task imported from Anki, this would be the Anki card ID.
  modificationTimestampMillis: number | null;
  title: string | null;
  url: string | null;
}

export interface TaskMetadata {
  isDeleted: boolean;
  provenance: TaskProvenance | null;
}
