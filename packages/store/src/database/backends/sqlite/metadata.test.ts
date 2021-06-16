import { SQLDatabaseBackend } from "../sqlite";
import { getMetadataKeys, setMetadataKeys } from "./metadata";
import { SQLMetadataTableKey } from "./tables";
import { execTransaction } from "./transactionUtils";

test("round-trip metadata keys", async () => {
  const backend = new SQLDatabaseBackend(SQLDatabaseBackend.inMemoryDBSubpath);
  const db = await backend.__accessDBForTesting();

  const input = { foo: "bar", baz: "bat" };
  await execTransaction(await db, (tx) => {
    setMetadataKeys(
      tx,
      input as unknown as Record<SQLMetadataTableKey, string>,
    );
  });

  expect(
    await getMetadataKeys(db, [
      "foo",
      "baz",
      "quux",
    ] as unknown as SQLMetadataTableKey[]),
  ).toMatchObject(input);
});
