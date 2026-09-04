import type { Meta, StoryObj } from "@storybook/react-webpack5";
import React from "react";
import { Text, TextStyle, View } from "react-native";
import { layout, type } from "./index.js";
import { getVariantStyles } from "./type.js";
import DebugGrid from "../components/DebugGrid.js";

const meta = {
  title: "Style/Type",
} satisfies Meta;
export default meta;

interface TypeStoryArgs {
  showGrid: boolean;
}

type Story = StoryObj<TypeStoryArgs>;

const gridControl = {
  showGrid: { name: "Show grid", control: { type: "boolean" as const } },
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

export const Hierarchy = {
  args: { showGrid: true },
  argTypes: gridControl,
  render: ({ showGrid }) => (
    <View>
      {Object.keys(type.typeStyles).map((specName) => (
        <TypeSample key={specName} shouldShowGrid={showGrid}>
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
  ),
} satisfies Story;

export const MultilineSamples = {
  args: { showGrid: true },
  argTypes: gridControl,
  render: ({ showGrid }) => {
    const sample =
      "Why is it contradictory to imagine that meta-rationality means the application of rationality to itself?";
    return (
      <View>
        {Object.keys(type.typeStyles).map((specName) => (
          <TypeSample key={specName} shouldShowGrid={showGrid}>
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
  },
} satisfies Story;

export const Variants = {
  args: { showGrid: true },
  argTypes: gridControl,
  render: ({ showGrid }) => {
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
        {showGrid && <DebugGrid />}
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
  },
} satisfies Story;
