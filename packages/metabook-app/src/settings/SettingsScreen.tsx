import { Link, Spacer, styles } from "metabook-ui";
import React from "react";
import { Text, View } from "react-native";

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
    Something&rsquo;s gone wrong, and we weren&rsquo;t able to complete your
    request. Please <Link href="mailto:contact@withorbit.com">email us</Link>{" "}
    (or reply to any past email) to resolve this issue.
  </>
);

const palette = styles.colors.palettes.lime;
export default function SettingsScreen() {
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
        return { message: <Problem />, headline: "Hm..." };
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
      <View style={{ maxWidth: 500, margin: "auto" }}>
        <Text style={styles.type.headline.layoutStyle}>{headline}</Text>
        <Spacer units={4} />
        <Text style={styles.type.runningText.layoutStyle}>{message}</Text>
      </View>
    </View>
  );
}
