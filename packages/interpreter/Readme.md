# @withorbit/interpreter

This package, in conjunction with `@withorbit/ingester`, lets you import Orbit prompts from some other data source, and to keep your Orbit database in sync with that data source, ingesting missing prompts and deleting deleted ones as necessary.

This package is responsible for parsing those data sources and producing a JSON file which describes the prompts embedded within it. `ingester` can then synchronize an Orbit database with the prompts in that file. 

Right now, the only support data source is a folder of Markdown notes, so that you can commingle prompts with prose within a personal knowledge system.

## Example usage

⚠️ If you were a user of the older `@withorbit/note-sync` tool, see the migration notes at the bottom of this document before proceeding.

```
# Optional: set up a test note.
mkdir -p TestNotes
echo "# Test note\nThis is a {test cloze} note." > TestNotes/note.md

# Extract the prompts from a folder of Markdown notes and write a record of them to prompts.json.
# Here assuming you're at the orbit repo root!
bun run --cwd packages/interpreter interpret TestNotes prompts.json

# Sync a local Orbit database with that data source.
bun run --cwd packages/ingester ingest ~/myOrbitDB.orbitStore prompts.json 

# Optional: sync that local Orbit database with Orbit's server. (see documentation in ../sync/Readme.md for more)
ORBIT_TOKEN=myUserToken ORBIT_ENV=production bun run --cwd packages/sync sync ~/myOrbitDB.orbitStore
```

## Markdown prompt syntax

For example, here's an excerpt of some notes I wrote as I was studying Service Workers:

> During installation, service workers begin in the {installing} state, then transition to {activated} (or {error}) after {all the associated resources are fetched}. Before reaching that state, the service worker may transition to {waiting} until {no pre-existing service worker is controlling an open page}.
>
> Once activated, a service worker {performs one-time startup computation}, then transitions to {idle}. From that state, it’ll handle {fetch or message events} until it eventually terminates.
>
> Q. What’s the initial-registration gotcha for service workers’ control of web pages?
>
> A. They won’t control the web page which registered them until it’s refreshed, unless that client is specifically claimed.

### The basics

#### Creating typical two-sided SRS prompts

> Q. How many dimensions are in a qubit's vector space?
>
> A. Two.

The empty line between the question and answer is optional. The question and answer cannot currently span multiple paragraphs: the paragraph including `Q. ` or `A. ` is extracted as that field.

#### Creating cloze deletion prompts

In the context of prose notes, I'm finding cloze deletions are often somewhat more natural. This paragraph maps onto a single cloze deletion prompt with three cards:

> Once activated, a service worker {performs one-time startup computation}, then transitions to {idle}. From that state, it’ll handle {fetch or message events} until it eventually terminates.

The cloze prompt will use the entire paragraph surrounding the text. For example, this two-sided prompt is equivalent to one of the cards extracted from the previous example:

> Q. Once activated, a service worker ______, then transitions to idle. From that state, it’ll handle fetch or message events until it eventually terminates.
>
> A. Once activated, a service worker *performs one-time startup computation*, then transitions to idle. From that state, it’ll handle fetch or message events until it eventually terminates.

#### Idempotency and identity

This system is meant to operate idempotently. That is: you can keep revising your note files over time, and it'll keep track of changes accordingly. As you change your notes, the system will maintain your SRS state for all the embedded prompts, except for the prompts you've directly edited.

Somewhat more precisely, the embedded prompts have *identity*. You can modify the note around a prompt or even move the prompt to a new note, and your review history will be preserved. But if you modify a prompt's text, it will be treated as a new prompt, and your review history won't be ported from the old prompt. That's because this system's based on dumb plaintext files, which don't have enough semantic structure to unambiguously specify whether a given modification represents a new prompt or a modification of an old one. Fixing this would require introducing heuristics or extra identifying markup.

Two-sided prompt identities are derived from the hash of their question and answer text. Cloze prompt identities are derived from the hash of their containing paragraph.

While the system will happily track prompts if you rename notes or move prompts between note files, the behavior is undefined if identical prompts appear in multiple note files.

## Migrating from `note-sync`

`interpreter` and `ingester` replace the older `@withorbit/note-sync` package with a more maintainable and flexible implementation. **⚠️ Before using these tools**, you should make a copy of your Orbit database, then run this command to migrate it:

```
# (from this package's folder)
bun run migrateNoteSync ~/myOrbitDB.orbitStore
```

If you don't run this tool, the old `note-sync` prompts will stick around, but new duplicates will be added with no review history.

---

```
Copyright 2023 Andy Matuschak
SPDX-License-Identifier: Apache-2.0
```
