# @withorbit/note-sync

This package is meant to allow you to write prompts embedded within plaintext notes. It extracts those prompts and synchronizes them with a local Orbit database, ingesting missing prompts and removing deleted ones as necessary.

Sample invocation:

```
# Set up a test note. Note that currently the script assumes these notes are exported from Bear, i.e. via https://github.com/andymatuschak/Bear-Markdown-Export. This requirement should be relaxed!
mkdir -p testNotes

echo "# Test note\nThis is a {test cloze} note.\n<\!-- {BearID:BE407525-7100-4F63-9F11-690E325CDFE9-1084-00032CF318809DA5} -->" > testNotes/note.md

# Sync that cloze to a local Orbit store.
yarn sync myOrbitDB.orbitStore testNotes

# Now you can sync myOrbitDB.orbitStore to the server or load it with a local client.
```

## Implementation notes

This library is (unfortunately) implemented on top of some other libraries and should probably be rewritten.

Early in 2020, I implemented a general-purpose library for syncing tasks to SRS systems (Orbit, Anki) from arbitrary sources (notes, PDF annotations). It's called `spaced-everything`. You may see references to its parent library, `computer-supported-thinking`. I also implemented a parser for the Markdown extensions in a library called `incremental-thinking`.

In practice, I don't think we need such a general solution. The extra indirection adds a lot of complexity and confusion.

## Note syntax

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

While the system will happily track prompts if you move them between note files, the behavior is undefined if identical prompts appear in multiple note files.

## Syncing extracted prompts with Anki

`spaced-everything` can also sync note extracts to Anki.

### Setup

1. Launch Anki on all your devices and sync everything. The next step will cause a full sync to be required.
1. Open `spaced-everything/Spaced Everything.apkg`. This package will add the special note types we use to keep prompts in sync. Unfortunately, there's no API for this. The .apkg contains two suspended notes which use the new prompt types. Once you've imported it, you can easily delete those notes by deleting the "Spaced Everything" deck.
1. Sync Anki on your desktop, then on all the other devices, to take care of the full sync.
1. Run `yarn install` in the root of this repository.
1. Run `yarn run build` in the root of this repository.
1. Install [the AnkiConnect plugin](https://ankiweb.net/shared/info/2055492159). This adds an API layer to Anki.

### Syncing

The binary will be emitted at `spaced-everything-cli/bin/run`. Its help text:

```
Syncs the prompts in a set of incremental-thinking compatible notes files to Anki. Adds, updates, and deletes notes as necessary.

USAGE
  $ spaced-everything anki sync FILES...

ARGUMENTS
  FILES...  One or more note files to sync prompts from

OPTIONS
  -d, --deck=deck  [default: Default] the name of a Anki deck to sync notes to (deck must already exist)
  -h, --help       show CLI help
  -s, --syncToAnkiWeb  if set, causes Anki to sync changes to AnkiWeb

DESCRIPTION
  You'll first need to have set up AnkiConnect and the note types in Anki--see the Readme.

EXAMPLE
  $ spaced-everything anki sync --deck NotePrompts note1.org *.md
```

Note that by default it syncs to the Anki deck "Default". So a typical invocation looks like:

```
spaced-everything-cli/bin/run anki sync ~/Notes/*.md
``` 

Give it a try: you should see notes show up in Anki's browser as soon as the command completes.

### Some usage notes

1. AnkiConnect only works when Anki is running, so you'll need to leave Anki running.
2. The `spaced-everything` command syncs once and exits. If you want to continuously sync, use a cron job or a file watcher.
3. By default, `spaced-everything` doesn't cause Anki to sync to AnkiWeb. Pass `-s` to synchronize your local changes to the web after the script finishes.
4. The command only syncs _to_ Anki. Any modifications made within Anki will be clobbered.
5. The Anki cards are presented with the title of the file from which they were extracted (considered to be the first line). If the file came from Bear, the title will be a hotlink to jump to the source Bear note. Support for "external note system identifiers" is general, so that feature can easily be extended for other editors which can be opened via URL (add to `getNoteID` in `incremental-thinking/src/notes.ts`).

```
Copyright 2020 Andy Matuschak
SPDX-License-Identifier: Apache-2.0
```
