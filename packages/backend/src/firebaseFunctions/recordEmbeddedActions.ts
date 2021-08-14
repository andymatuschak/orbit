import functions from "firebase-functions";
import { recordEmbeddedActions } from "../api/util/recordEmbeddedActionsImpl";

export default functions.https.onCall(async (args, context) => {
  if (!context.auth?.uid) {
    throw new Error("this operation requires authentication");
  }
  await recordEmbeddedActions(args, context.auth.uid);
});
