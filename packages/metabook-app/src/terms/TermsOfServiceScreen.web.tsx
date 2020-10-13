import React from "react";
import { Link, Logo, Spacer, styles } from "metabook-ui";
import { View, Text } from "react-native";

const palette = styles.colors.palettes.green;
export default function TermsOfServiceScreenWeb() {
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
          Orbit is an experimental service. If you create an account, we will
          track your responses to questions and notify you when review sessions
          are ready. We'll use response data for research purposes, and may
          sometimes publish that research, with users' identifiying information
          anonymized. We may allow authors to access anonymized response data
          for content they've created. We will not share or sell your email
          address or other personal information.
        </Text>
        <Spacer units={3} />
        <Text style={styles.type.runningText.layoutStyle}>
          In order to implement the Orbit service, we share your data with some
          cloud service providers who process this data on our behalf. Those
          providers include: Google LLC (storage, web hosting, analytics);
          Functional Software, Inc. (via their error monitoring service Sentry),
          and Mailjet, Inc. (for email notifications).
        </Text>
        <Spacer units={3} />
        <Text style={styles.type.runningText.layoutStyle}>
          If you'd like to withdraw consent for our use of your data, would like
          your data forgotten, would like access to your data, or would like to
          stop receiving notifications, please{" "}
          <Link href="mailto:contact@withorbit.com">email us</Link>.
        </Text>
      </View>
    </View>
  );
}
