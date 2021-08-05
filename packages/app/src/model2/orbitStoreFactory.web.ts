import { OrbitStore } from "@withorbit/store-shared";
import OrbitStoreWeb from "@withorbit/store-web";

export async function createOrbitStore(
  databaseName: string,
): Promise<OrbitStore> {
  return new OrbitStoreWeb({ databaseName });
}
