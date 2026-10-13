import Constants from "expo-constants";

/** Developer tooling never selects a different account or a public backend. */
export default {
  labOrigin: Constants.expoConfig!.extra!.labOrigin as string,
};
