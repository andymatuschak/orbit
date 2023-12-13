import { Button, IconName, Logo, styles } from "@withorbit/ui";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { Image, StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={stylesheet.container}>
      <Button
        title="Button"
        onPress={() => console.log("pressed")}
        accentColor={styles.colors.palettes.red.accentColor}
        backgroundColor={styles.colors.palettes.red.secondaryBackgroundColor}
        iconName={IconName.Check}
        color={styles.colors.white}
        style={{ width: 250 }}
      />
      <Logo units={4} tintColor="red" />
      <Text>Open up App.tsx to start working on your app!</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const stylesheet = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: styles.colors.palettes.red.backgroundColor,
    alignItems: "center",
    justifyContent: "center",
  },
});
