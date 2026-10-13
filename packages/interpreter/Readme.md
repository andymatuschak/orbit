# Markdown interpreter

The existing Bear/Markdown parser converts notes into the ingester's source/item
format. Bear IDs, prompt hashes, cloze ranges, QA parsing, and math handling are
unchanged. It has no knowledge of Lab, accounts, or persistence.

```sh
bun run --cwd packages/interpreter interpret <notes-directory> <output.json>
```

The directory contains the Markdown note exports. Include the Bear ID markup
from the normal export to retain source identity when a note is renamed or moved.
The generated JSON contains private note content; keep it outside the checkout
in a protected directory.

Interpretation is separate from ingestion so the generated input can be inspected
and previewed before applying changes. See [the ingester](../ingester/Readme.md).
The obsolete event-store migration command is intentionally not restored.
