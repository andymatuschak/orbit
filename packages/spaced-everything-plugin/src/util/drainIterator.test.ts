import levelup, { LevelUp } from "levelup";
import MemDown from "memdown";
import drainIterator from "./drainIterator";

let db: LevelUp;
beforeEach(async () => {
  db = levelup(MemDown());
  await db.put("foo", "bar");
  await db.put("baz", "quux");
});

afterEach(async () => {
  await db.close();
});

test("keys only", async () => {
  const output = await drainIterator(
    db.iterator({
      keys: true,
      values: false,
      keyAsBuffer: false,
      valueAsBuffer: false,
    }),
  );
  expect(output[0][0]).toEqual("baz");
  expect(output[1][0]).toEqual("foo");
});

test("values only", async () => {
  const output = await drainIterator(
    db.iterator({
      keys: false,
      values: true,
      keyAsBuffer: false,
      valueAsBuffer: false,
    }),
  );
  expect(output[0][1]).toEqual("quux");
  expect(output[1][1]).toEqual("bar");
});

test("keys and values", async () => {
  const output = await drainIterator(
    db.iterator({
      keys: true,
      values: true,
      keyAsBuffer: false,
      valueAsBuffer: false,
    }),
  );
  expect(output).toMatchObject([
    ["baz", "quux"],
    ["foo", "bar"],
  ]);
});
