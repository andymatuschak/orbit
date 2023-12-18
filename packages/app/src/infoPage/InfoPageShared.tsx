import { styles } from "@withorbit/ui";
import React, { ReactNode } from "react";
import { StyleSheet, Text } from "react-native";

const localStyles = StyleSheet.create({
  headingLargeSize: {
    marginTop: styles.layout.gridUnit * 6,
    marginBottom: styles.layout.gridUnit * 2,
  },
  headingSmallSize: {
    marginTop: styles.layout.gridUnit * 3,
    marginBottom: styles.layout.gridUnit * 2,
  },
  paragraph: {
    marginBottom: styles.layout.gridUnit * 2,
  },
});

const SizeContext = React.createContext<"large" | "small">("large");
export const SizeContextProvider = SizeContext.Provider;

export function Heading({ children }: { children: ReactNode }) {
  const size = React.useContext(SizeContext);
  return (
    <Text
      style={[
        styles.type.headline.layoutStyle,
        size === "large"
          ? localStyles.headingLargeSize
          : localStyles.headingSmallSize,
      ]}
    >
      {children}
    </Text>
  );
}

export function Paragraph({ children }: { children: ReactNode }) {
  const size = React.useContext(SizeContext);
  return (
    <Text
      style={[
        size === "large"
          ? styles.type.runningText.layoutStyle
          : styles.type.runningTextSmall.layoutStyle,
        localStyles.paragraph,
      ]}
    >
      {children}
    </Text>
  );
}

export interface InfoPageProps {
  contents: ReactNode;
  palette: styles.colors.ColorPalette;
  summaryContents?: ReactNode;
}
