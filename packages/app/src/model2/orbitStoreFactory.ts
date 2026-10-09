import { OrbitStore } from "@withorbit/store-shared";
import OrbitStoreFS from "@withorbit/store-fs";

const legacyDatabaseName = "shared.orbitStore";

export async function createOrbitStore(
  databaseName: string,
): Promise<OrbitStore> {
  return new OrbitStoreFS(databaseName);
}

export async function createDefaultOrbitStore(): Promise<OrbitStore> {
  return createOrbitStore(legacyDatabaseName);
}
