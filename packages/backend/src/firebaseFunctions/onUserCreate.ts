import functions from "firebase-functions";
import { updateUserMetadata } from "../db/firebaseAccountData.js";
import { provisionHostedVaultAccount } from "../db/hostedVaultAccounts.js";
import { getApp } from "../firebaseApp.js";
import getDefaultEmailService from "../email/index.js";
import { EmailSpec } from "../email/types.js";
import { sharedLoggingService } from "../logging/index.js";

// TODO: we'll need to send a different welcome email if they sign up outside the context of a reading
const welcomeEmailSpec: EmailSpec = {
  subject: "Welcome to Orbit",
  text: `Just a quick email to confirm: you're all set up to bring ideas into your orbit.
  
Most people quickly forget much of what they read. So in a few days, we'll invite you to your first Orbit session. By quickly repeating the prompts you've collected so far, you'll reinforce your memory of the material and keep yourself in contact with those ideas. Each time you remember the answer to a prompt, its orbit expands: you'll next see it after a two-week break, then a month, then two months, and so on. If you forget an answer, the orbit contracts to help you reinforce that idea.  These occasional sessions will take a few minutes--but in exchange, you'll internalize what you read, deeply and for the long-term.

Incidentally, Orbit itself is a work in progress by Andy Matuschak (hello!). If you have any comments or questions while you experiment with this unusual new system, you can reply to any email from Orbit to reach me. Or contact me directly at contact@withorbit.com.`,
};

const onUserCreate = functions.auth.user().onCreate(async (user, context) => {
  const userID = user.uid;
  if (!user.email) {
    throw new Error(`New user has no email address: ${userID}`);
  }
  const emailAddress = user.email;

  const registrationTimestampMillis = Date.parse(context.timestamp);
  const projectID = getApp().options.projectId ?? process.env.GCLOUD_PROJECT;
  if (!projectID) throw new Error("Firebase project ID is unavailable");

  // Keep account bootstrap and today's welcome-email behavior independent:
  // either side is attempted even if the other fails. Trigger redelivery has
  // the same possible duplicate-email window as before Phase 3.
  const results = await Promise.allSettled([
    provisionHostedVaultAccount({
      authIssuer: `https://securetoken.google.com/${projectID}`,
      authSubject: userID,
      emailAddress,
      registrationTimestampMillis,
      mode:
        process.env.ORBIT_AUTOMERGE_NEW_ACCOUNTS === "true"
          ? "new-automerge"
          : "legacy",
    }),
    (async () => {
      await updateUserMetadata(userID, {
        registrationTimestampMillis,
      });
      await sharedLoggingService.logUserEvent({
        userID,
        timestamp: registrationTimestampMillis,
        eventName: "registration",
        emailAddress,
      });
      await getDefaultEmailService().sendEmail(emailAddress, welcomeEmailSpec);
    })(),
  ]);
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failures.length > 0) {
    const reason = failures[0].reason;
    throw reason instanceof Error
      ? reason
      : new Error("New-account provisioning did not fully complete");
  }
});

export default onUserCreate;
