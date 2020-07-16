import React from "react";
import { TextProps, Text, StyleSheet, View, TextStyle } from "react-native";
import * as type from "../styles/type";

// These components compensate for the silly baseline-ignoring layout that the web (and hence RN do). These components position the baselines on a baseline, and they don't add any extra padding below.

function BaselinePositioned(
  props: TextProps & {
    children: React.ReactNode;
    topShift: number;
    bottomShift: number;
    textStyles: TextStyle;
  },
) {
  const { topShift, bottomShift, textStyles, ...restProps } = props;
  return (
    <View style={{ marginBottom: bottomShift }}>
      <Text
        {...restProps}
        style={StyleSheet.compose(props.style, [
          textStyles,
          {
            position: "relative",
            top: topShift,
          },
        ])}
      />
    </View>
  );
}

export function DisplayLarge(props: TextProps & { children: React.ReactNode }) {
  return (
    <BaselinePositioned
      topShift={-17}
      bottomShift={-20}
      textStyles={type.displayLarge}
      {...props}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Display(props: TextProps & { children: React.ReactNode }) {
  return (
    <BaselinePositioned
      topShift={-12}
      bottomShift={-16}
      textStyles={type.display}
      {...props}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Title(props: TextProps & { children: React.ReactNode }) {
  return (
    <BaselinePositioned
      topShift={-7}
      bottomShift={-8}
      textStyles={type.title}
      {...props}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Headline(props: TextProps & { children: React.ReactNode }) {
  return (
    <BaselinePositioned
      topShift={-7}
      bottomShift={-8}
      textStyles={type.headline}
      {...props}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Body(props: TextProps & { children: React.ReactNode }) {
  return (
    <BaselinePositioned
      topShift={-6}
      bottomShift={-8}
      textStyles={type.body}
      {...props}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Label(props: TextProps & { children: React.ReactNode }) {
  return (
    <BaselinePositioned
      topShift={-6}
      bottomShift={-8}
      textStyles={type.label}
      {...props}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Caption(props: TextProps & { children: React.ReactNode }) {
  return (
    <BaselinePositioned
      topShift={-5}
      bottomShift={-8}
      textStyles={type.caption}
      {...props}
    >
      {props.children}
    </BaselinePositioned>
  );
}
