import AsyncStorage from "@react-native-async-storage/async-storage";
import { LabConnectionManager } from "./labConnection.js";

// Deliberately independent of public Orbit's account/vault selection record.
export const labConnectionStorageKey = "com.withorbit.lab.connection.v1";
export const labConnectionManager = new LabConnectionManager({
  load: () => AsyncStorage.getItem(labConnectionStorageKey),
  save: (value) => AsyncStorage.setItem(labConnectionStorageKey, value),
});
