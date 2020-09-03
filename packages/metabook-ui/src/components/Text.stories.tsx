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
        <DisplayLarge>Display Large</DisplayLarge>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Display>Display</Display>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Title>Title</Title>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Headline>Headline</Headline>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Body>Body</Body>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <BodySmall>Body Small</BodySmall>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Label>Label</Label>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Caption>Caption</Caption>
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
        <DisplayLarge>
          Display Large: is so large! a shorter sample
        </DisplayLarge>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Display>Display: {sample}</Display>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Title>Title: {sample}</Title>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Headline>Headline: {sample}</Headline>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Body>Body: {sample}</Body>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <BodySmall>Body Small: {sample}</BodySmall>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Label>Label: {sample}</Label>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Caption>Caption: {sample}</Caption>
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
