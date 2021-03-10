// Annotations mostly drawn from this very helpful reference: https://github.com/ankidroid/Anki-Android/wiki/Database-Structure

// table: notes
export interface Note {
  id: number; // timestamp (ms since epoch) at creation; used locally as ID
  guid: string; // GUID used for syncing
  mid: number; // model ID
  mod: number; // timestamp (s since epoch) since last modified
  usn: number; // sequence number for syncing
  tags: string; // space-separated string of tags, includes space at beginning and end for LIKE "% tag %" queries
  flds: string; // the values of the fields in this note. separated by 0x1f (31) character.
  sfld: string; // sort field: used for quick sorting and duplicate check
  csum: number; // field checksum used for duplicate check. integer representation of first 8 digits of sha1 hash of the first field
  flags: 0; // unused
  data: ""; // unused
}

// table: cards
export interface Card {
  id: number; // timestamp (ms since epoch) at creation; used as ID
  nid: number; // note.id
  did: number; // deck.id
  ord: number; // identifies which of the card templates or cloze deletions it corresponds to. For card templates, valid values are from 0 to num templates - 1. For cloze deletions, valid values are from 0 to max cloze index - 1 (they're 0 indexed despite the first being called `c1`).
  mod: number; // modification timestamp (s since epoch)
  usn: number; // sequence number for syncing (-1 indicates changes to push to server; < server indicates changes need to be pulled from server
  type: CardType;
  queue: CardQueue;
  due: number; // used differently for different card types: new: note id or random int; due: integer day, relative to the collection's creation time; learning: integer timestamp
  ivl: number; // interval (i.e. for SRS) Negative = seconds, positive = days
  factor: number; // The ease factor of the card in permille (parts per thousand). If the ease factor is 2500, the card’s interval will be multiplied by 2.5 the next time you press Good.
  reps: number; // number of reviews
  lapses: number; // the number of times the card went from a "was answered correctly" to "was answered incorrectly" state
  left: number; // of the form a*1000+b, with: b the number of reps left till graduation; a the number of reps left today
  odue: number; // original due: In filtered decks, it's the original due date that the card had before moving to filtered. If the card lapsed in scheduler1, then it's the value before the lapse. (This is used when switching to scheduler 2. At this time, cards in learning becomes due again, with their previous due date). In any other case it's 0.
  odid: number; // original did: only used when the card is currently in filtered deck
  flags: number; // This integer mod 8 represents a "flag", which can be see in browser and while reviewing a note. Red 1, Orange 2, Green 3, Blue 4, no flag: 0. This integer divided by 8 represents currently nothing (??)
  data: ""; // currently unused
}

export enum CardType {
  New = 0,
  Learning = 1,
  Due = 2,
  Relearning = 3,
}

export enum CardQueue {
  UserBuried = -3, // in scheduler 2
  Buried = -2,
  Suspended = -1,
  New = 0,
  Learning = 1,
  Due = 2,
  LearningNotDue = 3, // In learning, but next review is at least a day after the previous review due
}

// table: col
export interface Collection {
  id: number; // arbitrary number since there is only one row
  crt: number; // timestamp of the creation date (s since epoch). It's correct up to the day. For V1 scheduler, the hour corresponds to starting a new day. By default, new day is 4.
  mod: number; // last modified (ms since epoch)
  scm: number; // schema mod time: time when "schema" was modified.
  ver: number; // version
  dty: 0; // unused, always zero
  usn: number; // update sequence number for syncing
  ls: number; // last sync time
  conf: Configuration;
  models: { [key: string]: Model }; // keys are model IDs
  decks: { [key: string]: Deck }; // keys are deck IDs;
  dconf: {
    [key: string]: {
      // TODO
    };
  };
  tags: { [key: string]: number }; // cache of tags used in the collection (not sure what the numbers are)
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface Configuration {
  // TODO
}

export interface Model {
  css: string; // CSS for templates
  did: number; // ID of default deck to add cards to
  flds: ModelField[];
  id: string; // model ID, as referenced by mid in notes
  latexPost: string; // String added to end of LaTeX expressions (usually \\end{document})
  latexPre: string; // "preamble for LaTeX expressions
  mod: number; // modification time (s since epoch)
  name: string; // model name
  req: ModelTemplateRequirement[];
  sortf: number; // Integer specifying which field is used for sorting in the browser
  tags: string[]; // Tags of last-added note
  tmpls: CardTemplate[];
  type: ModelType; // Integer specifying what type of model. 0 for standard, 1 for cloze,
  usn: number; // update sequence number for syncing
  vers: []; // version number (unused, set as empty array)
}

export enum ModelType {
  Standard = 0,
  Cloze = 1,
}

export interface ModelField {
  font: string;
  media: []; // appears to be unused
  name: string; // field name
  ord: number; // ordinal of the field - goes from 0 to num fields -1,
  rtl: boolean; // when true, uses RTL script
  size: number; // font size
  sticky: boolean; // sticky fields retain the value that was last added when adding new notes
}

export interface CardTemplate {
  afmt: string; // Answer string
  bafmt: string; // Format string for displaying answer in browser
  bqfmt: string; // Format string for displaying question in browser
  did: number | null; // Override for default deck ID (null by default)
  name: string; // template name
  ord: number; // template ordinal number; see ModelField and Model.flds
  qfmt: string; // Question format string
}

/* Array of arrays describing, for each template T, which fields are required to generate T.
The array is of the form [T,string,list], where:
-  T is the ordinal of the template.
- The string is 'none', 'all' or 'any'.
- The list contains ordinal of fields, in increasing order.
  The meaning is as follows:
- if the string is 'none', then no cards are generated for this template. The list should be empty.
- if the string is 'all' then the card is generated only if each field of the list are filled
- if the string is 'any', then the card is generated if any of the field of the list is filled.

  The algorithm to decide how to compute req from the template is explained on:
  https://github.com/Arthur-Milchior/anki/blob/commented/documentation//templates_generation_rules.md */
export type ModelTemplateRequirement = [
  number,
  "none" | "all" | "any",
  number[],
];

export interface Deck {
  name: string; // name of deck
  extendRev?: number; // extended review card limit (for custom study) When absent, considered to be 10 by aqt.customstudy
  usn: number; // update sequence number for syncing,
  collapsed: boolean; // true when deck is collapsed in Anki main window
  browserCollapsed: boolean; // true when collapsed in the browser,
  // tracking numbers used by scheduler, uncertain how they work
  newToday: [number, number];
  revToday: [number, number];
  lrnToday: [number, number];
  timeToday: [number, number]; // two number array used somehow for custom study
  dyn: 0 | 1; // 1 if dynamic (AKA filtered) deck,
  extendNew?: number; // extended new card limit (for custom study). Potentially absent, in this case it's considered to be 10 by aqt.customstudy
  conf: number; // id of option group from dconf in `col` table. Or absent if the deck is dynamic. It's absent in filtered decks,
  id: number; // deck ID
  mod: number; // last modification timestamp (? since epoch)
  desc: string; // deck description
}

// table: revlog
export interface BaseLog {
  id: number; // timestamp (ms since epoch)
  cid: number; // cards.id
  usn: number; // sequence number (for syncing)
  ivl: number; // interval (until next review?). negative numbers are seconds; positive numbers are days
  lastIvl: number; // last interval (i.e. the last value of ivl. Note that this value is not necessarily equal to the actual interval between this review and the preceding review)
  factor: number; // ease factor
  time: number; // how many milliseconds your review took, up to 60000 (60s)
}

export interface LearnLog extends BaseLog {
  type: ReviewLogType.Learn | ReviewLogType.Relearn;
  ease: LearnEaseRating;
}

export interface ReviewLog extends BaseLog {
  type: ReviewLogType.Review | ReviewLogType.Cram; // TODO: does Cram's ease really work this way?
  ease: ReviewEaseRating;
}

export type Log = LearnLog | ReviewLog;

export enum ReviewEaseRating {
  Again = 1,
  Hard = 2,
  Good = 3,
  Easy = 4,
}

export enum LearnEaseRating {
  Again = 1,
  Good = 2,
  Easy = 3,
}

export enum ReviewLogType {
  Learn = 0,
  Review = 1,
  Relearn = 2,
  Cram = 3,
}
