import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  VaultRegistryManager,
  type VaultRegistryStorage,
} from "./vaultRegistry.js";

const vaultRegistryStorageKey = "com.withorbit.vaultRegistry.v2";

export class DefaultVaultRegistryStorage implements VaultRegistryStorage {
  load(): Promise<string | null> {
    return AsyncStorage.getItem(vaultRegistryStorageKey);
  }

  save(serializedRegistry: string): Promise<void> {
    return AsyncStorage.setItem(vaultRegistryStorageKey, serializedRegistry);
  }
}

// AsyncStorage has no compare-and-swap primitive. One process-wide manager
// serializes first-open creation and account-cache registration.
export const defaultVaultRegistryManager = new VaultRegistryManager(
  new DefaultVaultRegistryStorage(),
);
