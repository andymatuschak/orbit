import { Link, Spacer, styles } from "@withorbit/ui";
import React from "react";
import { Platform, Text, View } from "react-native";
import serviceConfig from "../../../serviceConfig.js";
import { FirebaseOpaqueIDToken } from "../../authentication/index.js";
import { useAuthenticationClient } from "../../authentication/authContext.js";
import { useEmbeddedAuthenticationState } from "../../embedded/useEmbeddedAuthenticationState.js";

const Unsubscribe = () => (
  <>
    You&rsquo;ve been unsubscribed from review session notifications.
    Orbit&rsquo;s still under heavy construction, so there&rsquo;s no interface
    to resubscribe right now.{" "}
    <Link href="mailto:contact@withorbit.com">Email us</Link> (or reply to any
    past email) if you&rsquo;d like to resubscribe.
  </>
);

const Snooze = () => (
  <>We won&rsquo;t send you any more review session notifications for a week.</>
);

const Problem = () => (
  <>
    Someting&rsquo;s gone wrong, and we weren&rsquo;t able to complete your
    request. Please <Link href="mailto:contact@withorbit.com">email us</Link>{" "}
    (or reply to any past email) to resolve this issue.
  </>
);

// TODO: extract, generalize
async function requestPersonalAccessToken(
  idToken: FirebaseOpaqueIDToken,
): Promise<string> {
  const request = new Request(
    `${serviceConfig.httpsAPIBaseURLString}/internal/auth/personalAccessTokens`,
    { method: "POST", headers: { Authorization: `ID ${idToken}` } },
  );

  const fetchResult = await fetch(request);
  if (fetchResult.ok) {
    const response = await fetchResult.json();
    return response.token;
  } else {
    throw new Error(
      `Couldn't generate personal access token ${
        fetchResult.status
      }: ${await fetchResult.text()}`,
    );
  }
}

const GeneratePersonalAccessToken = () => {
  const [token, setToken] = React.useState<string | null>(null);
  const authenticationClient = useAuthenticationClient();
  const authenticationState =
    useEmbeddedAuthenticationState(authenticationClient);

  React.useEffect(() => {
    if (authenticationState.status === "signedIn") {
      authenticationClient.getCurrentIDToken().then(async (idToken) => {
        const personalAccessToken = await requestPersonalAccessToken(idToken);
        setToken(personalAccessToken);
      });
    } else if (authenticationState.status === "signedOut") {
      if (Platform.OS === "web") {
        // TODO: extract routing functionality
        location.href = `/login?continue=${encodeURIComponent(location.href)}`;
      }
    }
  }, [authenticationClient, authenticationState]);

  if (token) {
    return (
      <>{`Your personal access token:
${token}

Treat this like a password: anyone who has this token can access your account.`}</>
    );
  } else {
    return <>One moment…</>;
  }
};

const palette = styles.colors.palettes.lime;
export default function SettingsPage() {
  const { message, headline } = React.useMemo(() => {
    const url = new URL(location.href);
    const params = url.searchParams;
    const action = params.get("completedAction");
    switch (action) {
      case "unsubscribe":
        return { message: <Unsubscribe />, headline: "Got it." };
      case "snooze1Week":
        return { message: <Snooze />, headline: "Got it." };
      default:
        if (params.get("action") === "generatePersonalAccessToken") {
          return {
            message: <GeneratePersonalAccessToken />,
            headline: "Personal access token",
          };
        } else {
          return { message: <Problem />, headline: "Hm..." };
        }
    }
  }, []);

  return (
    <View
      style={{
        backgroundColor: palette.backgroundColor,
        flex: 1,
        padding: styles.layout.edgeMargin,
      }}
    >
      <View style={{ width: "100%", maxWidth: 500, margin: "auto" }}>
        <Text style={styles.type.headline.layoutStyle}>{headline}</Text>
        <Spacer units={4} />
        <Text style={styles.type.runningText.layoutStyle}>{message}</Text>
      </View>
    </View>
  );
}
