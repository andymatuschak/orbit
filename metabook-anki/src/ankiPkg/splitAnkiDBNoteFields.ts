// Extracts field contents from an Anki collection DB Note.flds column entry
export default function splitAnkiDBNoteFields(
  ankiDBNoteFields: string,
): string[] {
  return ankiDBNoteFields.split(String.fromCharCode(31));
}
