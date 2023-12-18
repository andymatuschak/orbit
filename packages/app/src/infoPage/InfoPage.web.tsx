import { Logo, styles, useLayout } from "@withorbit/ui";
import React, { ReactNode } from "react";
import { Image, Text, View } from "react-native";
import { InfoPageProps, SizeContextProvider } from "./InfoPageShared.js";

function Summary(props: { children: ReactNode; style: "small" | "large" }) {
  return (
    <Text
      style={[
        styles.type.headline.layoutStyle,
        {
          color: styles.colors.white,
          marginBottom:
            props.style === "large" ? styles.layout.gridUnit * 4 : 0,
        },
      ]}
    >
      {props.children}
    </Text>
  );
}

function LargeLayout(props: { width: number } & InfoPageProps) {
  const innerWidth = Math.min(props.width, 1400);
  const sidebarSize = (innerWidth - outerPadding * 2) / 2;
  const starburstSize = Math.min(sidebarSize, window.innerHeight);
  return (
    <View
      style={{
        flexDirection: "row",
        width: "100%",
        maxWidth: 1400,
        marginLeft: "auto",
        marginRight: "auto",
        paddingLeft: outerPadding,
        paddingRight: outerPadding,
      }}
    >
      <View
        style={{
          flex: 1,
          position: "relative",
        }}
      >
        <View
          /* @ts-ignore RN types don't know about position fixed. */
          style={{
            position: "fixed",
            height: "100%",
            width: sidebarSize,
          }}
        >
          <View
            style={{
              position: "absolute",
              top: outerPadding,
            }}
          >
            <a href="https://withorbit.com">
              <Logo units={4} tintColor={styles.colors.ink} />
            </a>
          </View>
          <Image
            source={require("../../assets/learnMore/starburst.svg")}
            style={{
              width: starburstSize - outerPadding,
              height: starburstSize - outerPadding,
              transform: [{ translateX: -outerPadding / 2 }],
              maxWidth: 500,
              maxHeight: 500,
              margin: "auto",
              tintColor: props.palette.accentColor,
            }}
          />
        </View>
      </View>
      <View
        style={{
          flex: 1,
          paddingTop: outerPadding,
          paddingBottom: outerPadding,
        }}
      >
        {props.summaryContents && (
          <View
            style={{
              maxWidth: 450,
              marginTop: styles.layout.gridUnit * 10,
              marginBottom: styles.layout.gridUnit * 2,
            }}
          >
            <Summary style="large">{props.summaryContents}</Summary>
          </View>
        )}
        {props.contents}
      </View>
    </View>
  );
}

function SmallLayout(props: InfoPageProps) {
  return (
    <View style={{ padding: styles.layout.edgeMargin }}>
      <View
        style={{
          position: "absolute",
        }}
      >
        <Logo units={4} tintColor={styles.colors.ink} />
      </View>
      <Image
        source={require("../../assets/learnMore/starburst-red.svg")}
        style={{
          position: "absolute",
          top: -40,
          right: -50,
          width: 350,
          height: 350,
          maxWidth: 500,
          maxHeight: 500,
          margin: "auto",
        }}
      />
      <View
        style={{
          maxWidth: 500,
        }}
      >
        {/*<DebugGrid />*/}
        {props.summaryContents && (
          <View
            style={{
              maxWidth: 450,
              marginTop: styles.layout.gridUnit * 30,
              marginBottom: styles.layout.gridUnit * 2,
            }}
          >
            <Summary style="small">{props.summaryContents}</Summary>
          </View>
        )}
        {props.contents}
      </View>
    </View>
  );
}

const outerPadding = styles.layout.gridUnit * 4;

export function InfoPage(props: InfoPageProps) {
  const { width, onLayout } = useLayout();
  let size: "large" | "small" | null;
  if (width >= 900) {
    size = "large";
  } else if (width > 0) {
    size = "small";
  } else {
    size = null;
  }

  return (
    <View
      style={{
        backgroundColor: props.palette.backgroundColor,
        flex: 1,
        width: "100%",
        overflow: "hidden",
      }}
      onLayout={onLayout}
    >
      {size && (
        <SizeContextProvider value={size}>
          {size === "large" ? (
            <LargeLayout width={width} {...props} />
          ) : (
            <SmallLayout {...props} />
          )}
        </SizeContextProvider>
      )}
    </View>
  );
}
