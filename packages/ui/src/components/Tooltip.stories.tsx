import { select, withKnobs } from "@storybook/addon-knobs";

import React, { useRef, useState } from "react";
import { Pressable, View } from "react-native";
import Hoverable from "./Hoverable";
import Tooltip from "./Tooltip";

export default {
  title: "Tooltip",
  component: Tooltip,
  decorators: [withKnobs],
};

export function Text() {
  const [isHovered, setHovered] = useState(false);
  const ref = useRef<View | null>(null);
  return (
    <Hoverable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <View
        ref={ref}
        style={{
          borderWidth: 1,
          borderColor: "black",
          width: "200px",
          height: "100px",
          padding: 20,
          margin: 100,
        }}
      >
        <Tooltip
          show={isHovered}
          placement={select(
            "direction",
            [
              "top",
              "right",
              "bottom",
              "left",
              "overlay",
              "inset-bottom-left",
              "inset-bottom-right",
              "inset-top-left",
              "inset-top-right",
            ],
            "top",
          )}
          anchorRef={ref}
        >
          Tooltip text
        </Tooltip>
        <div>Some Text That Is Important</div>
      </View>
    </Hoverable>
  );
}

export function Children() {
  const [isHovered, setHovered] = useState(false);
  const ref = useRef<View | null>(null);
  return (
    <Hoverable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <View
        ref={ref}
        style={{
          borderWidth: 1,
          borderColor: "black",
          width: "200px",
          height: "100px",
          padding: 20,
          margin: 100,
        }}
      >
        <Tooltip
          show={isHovered}
          placement={select(
            "placement",
            [
              "top",
              "right",
              "bottom",
              "left",
              "overlay",
              "inset-bottom-left",
              "inset-bottom-right",
              "inset-top-left",
              "inset-top-right",
            ],
            "top",
          )}
          anchorRef={ref}
        >
          <View
            style={{
              flexDirection: "row",
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "space-around",
            }}
          >
            <View
              style={{
                borderWidth: 1,
                borderColor: "red",
                backgroundColor: "red",
              }}
            >
              <p>L</p>
            </View>
            <View
              style={{
                borderWidth: 1,
                borderColor: "blue",
                backgroundColor: "blue",
              }}
            >
              <p>R</p>
            </View>
          </View>
        </Tooltip>
        <div>Some Text That Is Important</div>
      </View>
    </Hoverable>
  );
}

export function Button() {
  const [isHovered, setHovered] = useState(false);
  const ref = useRef<View | null>(null);
  return (
    <Hoverable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
    >
      <Pressable
        style={{
          borderWidth: 1,
          borderColor: "black",
          width: "120px",
          height: "50px",
          margin: 150,
        }}
        ref={ref}
      >
        <p>A Pressable</p>
        <Tooltip
          show={isHovered}
          placement={select(
            "placement",
            [
              "top",
              "right",
              "bottom",
              "left",
              "overlay",
              "inset-bottom-left",
              "inset-bottom-right",
              "inset-top-left",
              "inset-top-right",
            ],
            "top",
          )}
          anchorRef={ref}
        >
          Tooltip text
        </Tooltip>
      </Pressable>
    </Hoverable>
  );
}
