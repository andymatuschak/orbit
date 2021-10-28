import OrbitStoreFS from "@withorbit/store-fs";
import { OrbitStore } from "@withorbit/store-shared";

export async function createOrbitStore(
  databaseName: string,
): Promise<OrbitStore> {
  return new OrbitStoreFS(databaseName);
}
