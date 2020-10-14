import { styles } from "metabook-ui";
import React from "react";
import { ActivityIndicator, View } from "react-native";
import SignInScreen from "../signIn/SignInScreen";
import {
  useAuthenticationClient,
  useCurrentUserRecord,
} from "../util/authContext";
import ReviewSession from "./ReviewSession";

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: "center" }}>
      <ActivityIndicator size="large" color={styles.colors.productKeyColor} />
    </View>
  );
}

export default function ReviewSessionScreen() {
  const authenticationClient = useAuthenticationClient();
  const userRecord = useCurrentUserRecord(authenticationClient);

  if (userRecord) {
    return <ReviewSession />;
  } else if (userRecord === null) {
    return <SignInScreen />;
  } else {
    return <LoadingScreen />;
  }
}
