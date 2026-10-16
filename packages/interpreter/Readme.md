# Markdown interpreter

Pure Markdown-to-task interpretation, separate from ingestion and storage. The
only filesystem boundary is the CLI; the parser does not know about Lab,
accounts, persistence, or writing back to notes.

```sh
bun run --cwd packages/interpreter interpret <notes-directory> <output.json>
```

The CLI reads immediate, visible `.md` files and writes the ingester's JSON input.
Include the Bear ID markup from the normal export to retain source identity when
a note is renamed or moved. Generated JSON contains private note content; keep it
outside the checkout in a protected directory.

## Code map

- `src/interpret.ts`: `interpretMarkdownFiles(files)` combines source metadata,
  prompt extraction, task specs, and import identifiers.
- `src/markdown.ts`: one configured remark parser/stringifier, source metadata,
  Backlinks exclusion, and nearest-block cloze discovery. The parsed tree stays
  ordinary mdast; Q&A and Bear IDs do not become custom syntax nodes.
- `src/qa.ts`: root-level Q./A. extraction. It returns rendering fragments and
  separate original-source spans without mutating the document.
- `src/clozeSyntax.ts`: the one custom syntax extension. Micromark handles brace
  balancing, escaping, and Markdown inside a blank while excluding code and math
  from cloze recognition. This is not a text-regex preprocessing step.
- `src/hashTaskSpec.ts`: the historical SHA-256/base64 content identifier.

## Identity and positions

Normalized Markdown is part of the existing import identity. Stringifier options,
cloze component numbering, range order, and UTF-16 offsets must not change casually:
that would make existing prompts look new. Interpretation retains cloze-before-Q&A
output ordering for the same reason.

Cloze ranges address the **normalized review text**, not the original note. The
interpreter therefore renders and reparses each cloze block before removing its
braces and calculating ranges. Q&A source spans instead address the original
Markdown, including its Q./A. prefixes. Rendering fragments are not source-editing
coordinates.

Standalone BearID export comments also terminate Q&A regions. They remain in the
source file and identify the note, but are not answer content; a multiparagraph
answer's badge goes before that footer. Ordinary HTML comments and inline
examples are not treated as these boundaries.

The refactor preserves existing task-spec snapshots and fixes unanswered questions
at EOF, headingless Q&A notes, frontmatter-only notes, malformed cloze escapes,
Backlinks swallowing the next heading, and multiblock answers leaking extra cloze
tasks. The cloze syntax's pre-existing trailing-whitespace limitation remains
explicitly tested as skipped; changing it would change content normalization.

Interpretation is separate from ingestion so the generated input can be inspected
and previewed before applying changes. See [the ingester](../ingester/Readme.md).

## Stable task badges

To edit an imported prompt while retaining its learning history, put its existing
TaskID in a trailing Markdown link:

```md
Q. Front
A. Back [☉](orbit://task/AbCdEfGhIjKlMnOpQrStUv)
```

The original `orbit://AbCdEfGhIjKlMnOpQrStUv` form is also accepted. These are
actual 22-character, URL-safe Orbit task IDs, not content hashes or Automerge
document URLs. The link is identity metadata: it is removed before rendering task
content, calculating cloze ranges, or deriving a headingless note's title. Normal
links with other labels or schemes remain content; code examples are not badges.

A badge belongs at the end of the answer (including a multiblock answer's final
block), or at the end of a cloze block. A single-block answer does not include a
separate following paragraph. Invalid, ambiguous, or misplaced identity badges
report an error rather than guessing which task should receive the edit.
Use an inline link as shown above; reference-style Orbit badges are rejected.

The interpreter emits the badge's ID as the item's import identifier and optional
`taskID`. The ingester can adopt an existing task that was previously matched by
content hash, update its wording/provenance in place, and preserve its observations.
Unbadged prompts retain their historical content-hash identity. A deliberate copy
can get a new identity by removing its badge; duplicate badges are errors, not
instructions to merge two prompts.

Cloze wording edits preserve positional component IDs. Adding/removing blanks is
rejected before applying the import, and reordering existing blanks is **not safe**:
their histories still belong to positions, not stable per-blank IDs. A task badge
does not solve cloze-component identity.

Recognizing a badge does not mint IDs or write back to notes. The `interpret`
command remains read-only.
The `orbit://` link is recognized metadata, not yet implemented app navigation.

## Validation

`bun run --cwd packages/interpreter test` covers the syntax, source spans,
normalization, fixed historical hashes, and filesystem CLI boundary. Task-spec
snapshots are preserved rather than regenerated by the refactor. An additional
read-only comparison of 4,882 frozen Bear Markdown files (3,574 prompts) produced
byte-identical ingestion JSON before and after the rewrite; private corpus data
is not checked in.
