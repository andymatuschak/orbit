import { boolean, withKnobs } from "@storybook/addon-knobs";
import React from "react";
import { View } from "react-native";
import DebugGrid from "./DebugGrid";
import * as layout from "./layout";
import {
  Body,
  Caption,
  Display,
  DisplayLarge,
  Headline,
  Label,
  Title,
} from "./Text";

export default {
  title: "Style/Type",
  decorators: [withKnobs],
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
        width: 650,
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
          Display Large: is so large! a shorter multiline sample
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
        <Label>Label: {sample}</Label>
      </TypeSample>
      <TypeSample shouldShowGrid={shouldShowGrid}>
        <Caption>Caption: {sample}</Caption>
      </TypeSample>
    </View>
  );
}
