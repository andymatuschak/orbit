import withTestAnkiCollection from "../__fixtures__/withTestAnkiCollection";
import {
  readCards,
  readCollection,
  readLogs,
  readNotes,
} from "./ankiCollection";
import { Card, Note } from "./ankiDBTypes";

test("manifest contains two test images", async () => {
  await withTestAnkiCollection(async (handle, manifest) => {
    expect(manifest).toMatchInlineSnapshot(`
      Object {
        "0": "paste-5146b5478bc75de1c703057f0a51a93a70ca922d.jpg",
        "1": "paste-235d52a420e48250574495268d1eaadbcd40e188.jpg",
      }
    `);
  });
});

test("reads revlog", async () => {
  await withTestAnkiCollection(async (handle) => {
    const mock = jest.fn();
    await readLogs(handle, mock);
    expect(mock.mock.calls).toHaveLength(1);
    expect(mock.mock.calls[0][0]).toMatchInlineSnapshot(`
      Object {
        "cid": 1586378910504,
        "ease": 3,
        "factor": 2500,
        "id": 1586379272213,
        "ivl": 4,
        "lastIvl": -60,
        "time": 4183,
        "type": 0,
        "usn": -1,
      }
    `);
  });
});

test("read collection", async () => {
  await withTestAnkiCollection(async (handle) => {
    const collection = await readCollection(handle);

    const noteIDs: Set<number> = new Set();
    await readNotes(handle, (note: Note) => {
      expect(collection.models[note.mid.toString()]).toBeTruthy();
      expect(typeof note.id).toBe("number");
      noteIDs.add(note.id);
    });

    await readCards(handle, (card: Card) => {
      expect(noteIDs.has(card.nid)).toBeTruthy();
      expect(collection.decks[card.did.toString()]).toBeTruthy();
      expect(typeof card.id).toBe("number");
    });
  });
});