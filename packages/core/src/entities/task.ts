import { ColorPaletteName } from "../colorPaletteName.js";
import { EntityBase, EntityType } from "../entity.js";
import { AttachmentID } from "./attachmentReference.js";
export { parseSingleCurlyBraceClozePromptMarkup } from "./util/parseClozeMarkup.js";

// The Task entity stores the "spec" which describes a task's behavior and content, as well as the task's ongoing state and associated metadata.
export interface Task<TC extends TaskContent = TaskContent>
  extends EntityBase<EntityType.Task, TaskID> {
  id: TaskID;

  spec: TaskSpec<TC>;
  provenance: TaskProvenance | null;

  /**
   * Tasks may have several "components", each of which has its scheduling state separately tracked. For instance, cloze tasks have one component for each deletion. QA prompts just have one "main" component for now, but if we ever support double-sided flashcards, they'd have two, and so on.
   */
  componentStates: TaskComponentStates<TC>;
  isDeleted: boolean;

  // Arbitrary key/value store for use by applications in the Orbit ecosystem.
  metadata: { [key: string]: string };
}

/**
 * There will be one key in this structure for each key in the corresponding task content's `components` field.
 * @additionalProperties true
 */
export type TaskComponentStates<TC extends TaskContent> = {
  [ComponentID in ComponentIDsOf<TC>]: TaskComponentState;
};

export interface TaskComponentState {
  createdAtTimestampMillis: number;
  lastRepetitionTimestampMillis: number | null;
  intervalMillis: number;
  dueTimestampMillis: number; // due timestamp and interval can be changed independently

  // In the future, we'll likely accumulate a full list of reviews here.
  // We'll likely also support additional simple key/value state management, e.g. to determine which variant of application prompt to show.
}

/**
 * @TJS-type string
 * @TJS-pattern ^[0-9a-zA-Z_\-]{22}$
 */
export type TaskID = string & { __taskIDOpaqueType: never };

// ---

// A task spec describes the content of the task, along with any extra information necessary to describe how the scheduler and interactions should work for that task.
export type TaskSpec<TC extends TaskContent = TaskContent> = MemoryTaskSpec<TC>;

export type MemoryTaskSpec<TC extends TaskContent> = TaskSpecBase<
  TaskSpecType.Memory,
  TC
>;

interface TaskSpecBase<TST extends TaskSpecType, TC extends TaskContent> {
  // The type of a task spec describes its default scheduling behavior and interaction language. For instance, "memory" tasks use UI language around "remembering" and a scheduler tuned to support retention.
  type: TST;
  // In the future: options here around scheduling parameters, etc
  content: TC;
}

export enum TaskSpecType {
  Memory = "memory",
  // In the future: Generic, Custom, etc
}

// ---

// Task content is what's consistently displayed to the user when they're reviewing that particular task.
export type TaskContent = QATaskContent | ClozeTaskContent | PlainTaskContent;

export const mainTaskComponentID = "main";
export type MainTaskComponentID = typeof mainTaskComponentID;

export interface QATaskContent
  extends TaskContentBase<TaskContentType.QA, MainTaskComponentID, undefined> {
  body: TaskContentField;
  answer: TaskContentField;
}

export interface ClozeTaskContent
  extends TaskContentBase<
    TaskContentType.Cloze,
    string,
    { [ClozeID: string]: ClozeTaskContentComponent }
  > {
  body: TaskContentField;
}

export interface ClozeTaskContentComponent extends TaskContentComponent {
  ranges: {
    startIndex: number;
    length: number;
    hint: string | null;
  }[];
}

export interface PlainTaskContent
  extends TaskContentBase<
    TaskContentType.Plain,
    MainTaskComponentID,
    undefined
  > {
  type: TaskContentType.Plain;
  body: TaskContentField;
}

type TaskContentBase<
  TCT extends TaskContentType,
  ComponentIDs extends string,
  ComponentData extends
    | { [ComponentID in ComponentIDs]: TaskContentComponent }
    | undefined,
> = {
  type: TCT;
} & (ComponentData extends undefined ? unknown : { components: ComponentData });

export enum TaskContentType {
  QA = "qa",
  Cloze = "cloze",
  Plain = "plain",
}

export interface TaskContentComponent {
  order: number;
}

export type ComponentIDsOf<TC extends TaskContent> = TC extends TaskContentBase<
  any,
  infer ComponentIDs,
  any
>
  ? ComponentIDs
  : never;

export interface TaskContentField {
  text: string;
  attachments: AttachmentID[];
}

// ---

export interface TaskProvenance {
  identifier: string; // unique identifier representing a source which tasks might share, used for clustering; can be a URL or an arbitrary UUID
  url?: string; // an optional URL to open when the user indicates they'd like to navigate to the provenance of the task

  title?: string; // an optional title representing the task's provenance, suitable for presentation in the UI (e.g. the <title> of a web page, title of a note, etc)
  containerTitle?: string; // an optional title describing some larger body containing the task's provenance; e.g. if a web site has many chapters, title may be a chapter name while containerTitle may be the name of the web site. Perhaps at some point we'll use a more elaborate breadcrumb reprsentation a la schema.org.
  colorPaletteName?: ColorPaletteName;

  selectors?: TaskProvenanceSelector[];
}

// These selectors are a subset of the W3C Annotation selector schema.
// https://www.w3.org/TR/annotation-model/#selectors
export type TaskProvenanceSelector =
  | TaskProvenanceRangeSelector
  | TaskProvenanceTextPositionSelector
  | TaskProvenanceTextQuoteSelector
  | TaskProvenanceXPathSelector;

export enum TaskProvenanceSelectorType {
  Range = "RangeSelector",
  TextPosition = "TextPositionSelector",
  TextQuote = "TextQuoteSelector",
  XPath = "XPathSelector",
}

export interface TaskProvenanceRangeSelector {
  type: TaskProvenanceSelectorType.Range;
  startSelector: TaskProvenanceXPathSelector;
  endSelector: TaskProvenanceXPathSelector;
}

export interface TaskProvenanceTextPositionSelector {
  type: TaskProvenanceSelectorType.TextPosition;
  start: number;
  end: number;
}

export interface TaskProvenanceTextQuoteSelector {
  type: TaskProvenanceSelectorType.TextQuote;
  exact: string;
  prefix: string;
  suffix: string;
}

export interface TaskProvenanceXPathSelector {
  type: TaskProvenanceSelectorType.XPath;
  value: string;
  // The W3C spec allows this field on any selector type, but we only support it on XPaths for now; and for the moment, we only allow text position selectors.
  refinedBy: TaskProvenanceTextPositionSelector;
}
