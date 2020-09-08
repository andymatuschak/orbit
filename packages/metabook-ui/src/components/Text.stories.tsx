import { boolean } from "@storybook/addon-knobs";
import React from "react";
import { Text, TextStyle, View } from "react-native";
import { layout, type } from "../styles";
import { getVariantStyles } from "../styles/type";
import DebugGrid from "./DebugGrid";
import {
  Body,
  BodySmall,
  Caption,
  Display,
  DisplayLarge,
  Headline,
  Label,
  Title,
} from "./Text";

export default {
  title: "Style/Type",
};

function TypeSample(props: {
  shouldShowGrid: boolean;
  children: React.ReactNode;
}) {
  const backgroundColor = props.shouldShowGrid
    ? "rgba(0,0,0,0.075)"
    : "transparent";
  return (
    <View
      style={{
        backgroundColor,
        marginTop: layout.gridUnit * 5,
        maxWidth: 650,
      }}
    >
      {props.children}
    </View>
  );
}

export function Hierarchy() {
  const shouldShowGrid = boolean("Show grid", true);
  return (
    <View style={{ paddingBottom: layout.gridUnit * 6, paddingLeft: 16 }}>
      {shouldShowGrid && <DebugGrid />}
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.displayLarge.layoutStyle}>Display Large</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.display.layoutStyle}>Display</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.title.layoutStyle}>Title</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.headline.layoutStyle}>Headline</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.body.layoutStyle}>Body</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.bodySmall.layoutStyle}>Body Small</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.label.layoutStyle}>Label</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.caption.layoutStyle}>Caption</Text>
      </TypeSample>
    </View>
  );
}

export function MultilineSamples() {
  const shouldShowGrid = boolean("Show grid", true);
  const sample =
    "Why is it contradictory to imagine that meta-rationality means the application of rationality to itself?";
  return (
    <View style={{ paddingBottom: layout.gridUnit * 6, paddingLeft: 16 }}>
      {shouldShowGrid && <DebugGrid />}
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.displayLarge.layoutStyle}>
          Display Large: is so large! a shorter sample
        </Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.display.layoutStyle}>Display: {sample}</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.title.layoutStyle}>Title: {sample}</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.headline.layoutStyle}>Headline: {sample}</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.body.layoutStyle}>Body: {sample}</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.bodySmall.layoutStyle}>Body Small: {sample}</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.label.layoutStyle}>Label: {sample}</Text>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Text style={type.caption.layoutStyle}>Caption: {sample}</Text>
      </TypeSample>
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
        typeStyle={type.displayLarge.layoutStyle}
        text="Display Large"
      />
      <WithVariants typeStyle={type.display.layoutStyle} text="Display" />
      <WithVariants typeStyle={type.title.layoutStyle} text="Title" />
      <WithVariants typeStyle={type.headline.layoutStyle} text="Headline" />
      <WithVariants typeStyle={type.body.layoutStyle} text="Body" />
      <WithVariants typeStyle={type.bodySmall.layoutStyle} text="Body Small" />
      <WithVariants typeStyle={type.label.layoutStyle} text="Label" />
      <WithVariants typeStyle={type.caption.layoutStyle} text="Caption" />
    </View>
  );
}
