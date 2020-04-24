import { LevelUp } from "levelup";

export async function saveJSONRecord(
  db: LevelUp,
  key: string,
  value: unknown,
): Promise<void> {
  await db.put(key, JSON.stringify(value));
}

export async function getJSONRecord<T>(
  db: LevelUp,
  key: string,
): Promise<{ record: T } | null> {
  const recordString = await db
    .get(key)
    .catch((error) => (error.notFound ? null : Promise.reject(error)));
  if (recordString) {
    return { record: JSON.parse(recordString) };
  } else {
    return null;
  }
}
