import React from "react";
import { Platform } from "react-native";
import { useNavigation } from "expo-router";
import { AuthenticationClient } from "../../authentication/index.js";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../../authentication/authContext.js";
import Login from "./login.js";
import { LoadingScreen } from "../../reviewSession/LoadingScreen.js";
import ReviewSession from "../../reviewSession/ReviewSession.js";
import serviceConfig from "../../../serviceConfig.js";
import { isHostedSyncAccountEligible } from "../../sync/hostedSyncCohort.js";
import { defaultVaultRegistryManager } from "../../vault/vaultRegistryStorage.js";
import { selectCachedHostedReviewAccount } from "../../vault/vaultRegistry.js";

function extractAccessCode(): string | null {
  if (Platform.OS === "web") {
    const currentURL = new URL(location.href);
    return currentURL.searchParams.get("accessCode");
  } else {
    return null;
  }
}

async function loginWithAccessCode(
  accessCode: string,
  authenticationClient: AuthenticationClient,
): Promise<void> {
  const loginToken = await authenticationClient
    .getLoginTokenUsingAccessCode(accessCode)
    .catch(() => null);
  const authState = await authenticationClient.getUserAuthState();
  if (!authState && loginToken) {
    console.log("Signing in with access code");
    await authenticationClient.signInWithLoginToken(loginToken);
  }
}

function useAccessCode(authenticationClient: AuthenticationClient): boolean {
  const navigation = useNavigation<{
    setParams(params: { accessCode: string | undefined }): void;
  }>();
  const [isPendingAccessCode, setPendingAccessCode] = React.useState(
    Platform.OS === "web",
  );
  React.useEffect(() => {
    let canceled = false;
    if (Platform.OS === "web") {
      const accessCode = extractAccessCode();
      setPendingAccessCode(!!accessCode);
      if (accessCode) {
        // Auth changes alone cannot release this route's pending gate. Settle
        // it for valid, expired, and failed links so none leaves a spinner.
        void loginWithAccessCode(accessCode, authenticationClient)
          .catch(() => {
            console.warn("Could not sign in using the review link");
          })
          .finally(() => {
            if (canceled) return;
            // Exported lazy routes may not yet be registered during the first
            // effect. Clean up after the attempt, through the screen navigator,
            // so later router updates cannot restore the spent code.
            navigation.setParams({ accessCode: undefined });
            setPendingAccessCode(false);
          });
      }
    } else {
      setPendingAccessCode(false);
    }
    return () => {
      canceled = true;
    };
  }, [authenticationClient, navigation]);
  return isPendingAccessCode;
}

export default function ReviewSessionPage() {
  const authenticationClient = useAuthenticationClient();
  const isPendingAccessCode = useAccessCode(authenticationClient);
  const userRecord = useCurrentUserRecord(authenticationClient);
  const [cachedAccountID, setCachedAccountID] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    if (Platform.OS !== "ios" || !serviceConfig.hostedSyncEnabled) return;
    let canceled = false;
    void defaultVaultRegistryManager
      .getRegistry()
      .then((registry) => {
        if (canceled) return;
        setCachedAccountID(
          selectCachedHostedReviewAccount(
            registry,
            serviceConfig.hostedSyncServiceOrigin,
            (userID) =>
              isHostedSyncAccountEligible(
                userID,
                serviceConfig.hostedSyncAuthenticationUserIDs,
              ),
          ),
        );
      })
      .catch((error: unknown) => {
        console.warn("Could not read local vault selection", error);
      });
    return () => {
      canceled = true;
    };
  }, []);

  const accountID =
    userRecord?.userID ?? (userRecord === undefined ? cachedAccountID : null);

  if (accountID && !isPendingAccessCode) {
    return (
      <ReviewSession
        key={accountID}
        accountID={accountID}
        accountLabel={userRecord?.emailAddress ?? "this account"}
      />
    );
  } else if (userRecord === null && !isPendingAccessCode) {
    return <Login />;
  } else {
    return <LoadingScreen />;
  }
}
