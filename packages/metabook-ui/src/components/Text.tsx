import React from "react";
import {
  TextProps,
  Text,
  StyleSheet,
  View,
  TextStyle,
  StyleProp,
} from "react-native";
import * as type from "../styles/type";

// These components compensate for the silly baseline-ignoring layout that the web (and hence RN do). These components position the baselines on a baseline, and they don't add any extra padding below.

function BaselinePositioned(
  props: TextProps & {
    children: React.ReactNode;
    topShift: number;
    bottomShift: number;
    textStyle: StyleProp<TextStyle>;
  },
) {
  const { topShift, bottomShift, textStyle, ...restProps } = props;
  return (
    <View style={props.style}>
      <Text
        {...restProps}
        style={StyleSheet.compose(textStyle, {
          position: "relative",
          top: topShift,
          marginBottom: bottomShift,
        })}
      />
    </View>
  );
}

export function DisplayLarge(
  props: TextProps & { children: React.ReactNode; textStyle?: TextStyle },
) {
  return (
    <BaselinePositioned
      topShift={-17}
      bottomShift={-20}
      {...props}
      textStyle={StyleSheet.compose<TextStyle>(
        type.displayLarge,
        props.textStyle,
      )}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Display(
  props: TextProps & { children: React.ReactNode; textStyle?: TextStyle },
) {
  return (
    <BaselinePositioned
      topShift={-12}
      bottomShift={-16}
      {...props}
      textStyle={StyleSheet.compose<TextStyle>(type.display, props.textStyle)}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Title(
  props: TextProps & { children: React.ReactNode; textStyle?: TextStyle },
) {
  return (
    <BaselinePositioned
      topShift={-7}
      bottomShift={-8}
      {...props}
      textStyle={StyleSheet.compose<TextStyle>(type.title, props.textStyle)}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Headline(
  props: TextProps & { children: React.ReactNode; textStyle?: TextStyle },
) {
  return (
    <BaselinePositioned
      topShift={-7}
      bottomShift={-8}
      {...props}
      textStyle={StyleSheet.compose<TextStyle>(type.headline, props.textStyle)}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Body(
  props: TextProps & { children: React.ReactNode; textStyle?: TextStyle },
) {
  return (
    <BaselinePositioned
      topShift={-6}
      bottomShift={-8}
      {...props}
      textStyle={StyleSheet.compose<TextStyle>(type.body, props.textStyle)}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Label(
  props: TextProps & { children: React.ReactNode; textStyle?: TextStyle },
) {
  return (
    <BaselinePositioned
      topShift={-6}
      bottomShift={-8}
      {...props}
      textStyle={StyleSheet.compose<TextStyle>(type.label, props.textStyle)}
    >
      {props.children}
    </BaselinePositioned>
  );
}

export function Caption(
  props: TextProps & { children: React.ReactNode; textStyle?: TextStyle },
) {
  return (
    <BaselinePositioned
      topShift={-5}
      bottomShift={-8}
      {...props}
      textStyle={StyleSheet.compose<TextStyle>(type.caption, props.textStyle)}
    >
      {props.children}
    </BaselinePositioned>
  );
}
