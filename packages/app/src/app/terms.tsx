import React from "react";
import { Link, Logo, Spacer, styles } from "@withorbit/ui";
import { View, Text } from "react-native";

const palette = styles.colors.palettes.green;
export default function Terms() {
  return (
    <View
      style={{
        backgroundColor: palette.backgroundColor,
        flex: 1,
        padding: styles.layout.edgeMargin,
      }}
    >
      <View style={{ maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
        <Logo units={4} tintColor={styles.colors.ink} />
        <Spacer units={8} />
        <Text style={styles.type.headline.layoutStyle}>
          Orbit Terms of Service and Privacy Policy
        </Text>
        <Spacer units={4} />
        <Text style={styles.type.runningText.layoutStyle}>
          Orbit is an experimental research project. If you create an account,
          we will track your responses to prompts and notify you when review
          sessions are ready. We&rsquo;ll use aggregated response data to
          conduct research about how people read and learn. We may sometimes
          publish that research, but never in a way which would reveal your
          identity. We may allow authors to access anonymized response data for
          content they&rsquo;ve created, to help them understand and improve
          their work.
        </Text>
        <Spacer units={3} />
        <Text style={styles.type.runningText.layoutStyle}>
          In order to implement the Orbit service, we use some cloud service
          providers who process your data on our behalf. Those providers
          include: Google LLC (storage, web hosting, logs); Functional Software,
          Inc. (to track errors in the web site), and Mailjet, Inc. (to send you
          emails). None of these providers will share or store your data except
          as is required by our requests.
        </Text>
        <Spacer units={3} />
        <Text style={styles.type.runningText.layoutStyle}>
          If you&rsquo;d like to withdraw consent for our use of your data,
          would like your data forgotten, would like access to your data, or
          would like to stop receiving notifications, please{" "}
          <Link href="mailto:contact@withorbit.com">email us</Link>.
        </Text>
      </View>
    </View>
  );
}
