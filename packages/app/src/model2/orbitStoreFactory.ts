import OrbitStoreFS from "@withorbit/store-fs";
import { OrbitStore } from "@withorbit/store-shared";

export async function createOrbitStore(
  databaseName: string,
): Promise<OrbitStore> {
  return new OrbitStoreFS(databaseName);
}

export async function createDefaultOrbitStore(): Promise<OrbitStore> {
  return createOrbitStore("shared.orbitStore");
}
