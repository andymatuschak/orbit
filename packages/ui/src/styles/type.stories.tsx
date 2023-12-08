import { boolean } from "@storybook/addon-knobs";
import React from "react";
import { Text, TextStyle, View } from "react-native";
import { layout, type } from "./index.js";
import { getVariantStyles } from "./type.js";
import DebugGrid from "../components/DebugGrid.js";

export default {
  title: "Style/Type",
};

function TypeSample(props: {
  shouldShowGrid: boolean;
  children: React.ReactNode;
}) {
  const backgroundColor = props.shouldShowGrid
    ? "rgba(0,0,0,0.2)"
    : "transparent";
  return (
    <View
      style={{
        marginLeft: layout.edgeMargin,
        paddingTop: layout.gridUnit * 2,
        paddingBottom: layout.gridUnit * 2,
        marginBottom: layout.gridUnit * 5,
        position: "relative",
      }}
    >
      {props.shouldShowGrid && <DebugGrid />}
      <View
        style={{
          backgroundColor,
          maxWidth: 650,
        }}
      >
        {props.children}
      </View>
    </View>
  );
}

export function Hierarchy() {
  const shouldShowGrid = boolean("Show grid", true);
  return (
    <View>
      {Object.keys(type.typeStyles).map((specName) => (
        <TypeSample key={specName} shouldShowGrid={shouldShowGrid}>
          <Text
            style={
              type.typeStyles[specName as keyof typeof type.typeStyles]
                .layoutStyle
            }
          >
            {specName[0].toUpperCase() + specName.slice(1)}
          </Text>
        </TypeSample>
      ))}
    </View>
  );
}

export function MultilineSamples() {
  const shouldShowGrid = boolean("Show grid", true);
  const sample =
    "Why is it contradictory to imagine that meta-rationality means the application of rationality to itself?";
  return (
    <View>
      {Object.keys(type.typeStyles).map((specName) => (
        <TypeSample key={specName} shouldShowGrid={shouldShowGrid}>
          <Text
            style={
              type.typeStyles[specName as keyof typeof type.typeStyles]
                .layoutStyle
            }
          >
            {specName[0].toUpperCase() + specName.slice(1)}: {sample}
          </Text>
        </TypeSample>
      ))}
    </View>
  );
}

export function Variants() {
  const shouldShowGrid = boolean("Show grid", true);

  function WithVariants(props: { typeStyle: TextStyle; text: string }) {
    return (
      <View style={{ marginBottom: layout.gridUnit * 5 }}>
        <Text style={props.typeStyle}>
          {props.text}{" "}
          <Text
            style={getVariantStyles(props.typeStyle.fontFamily!, true, false)}
          >
            Bold
          </Text>{" "}
          <Text
            style={getVariantStyles(props.typeStyle.fontFamily!, false, true)}
          >
            Italic
          </Text>{" "}
          <Text
            style={getVariantStyles(props.typeStyle.fontFamily!, true, true)}
          >
            Bold+Italic
          </Text>
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: layout.gridUnit * 6, paddingLeft: 16 }}>
      {shouldShowGrid && <DebugGrid />}
      <WithVariants
        typeStyle={type.promptXXLarge.layoutStyle}
        text="Display Large"
      />
      <WithVariants typeStyle={type.promptXLarge.layoutStyle} text="Display" />
      <WithVariants typeStyle={type.promptLarge.layoutStyle} text="Headline" />
      <WithVariants typeStyle={type.promptMedium.layoutStyle} text="Body" />
      <WithVariants
        typeStyle={type.promptSmall.layoutStyle}
        text="Body Small"
      />
      <WithVariants typeStyle={type.label.layoutStyle} text="Label" />
      <WithVariants typeStyle={type.labelTiny.layoutStyle} text="Caption" />
    </View>
  );
}
