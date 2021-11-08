import { styles } from "@withorbit/ui";
import React from "react";
import { ActivityIndicator, View } from "react-native";

export function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        backgroundColor: styles.colors.palettes.red.backgroundColor, // TODO
      }}
    >
      <ActivityIndicator size="large" color={styles.colors.white} />
    </View>
  );
}
