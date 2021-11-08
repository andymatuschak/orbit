import { boolean, number, text, select, withKnobs } from "@storybook/addon-knobs";

import React, { useState, useRef } from "react";
import Hoverable from "./Hoverable";
import Tooltip from "./Tooltip";
import { Pressable, View } from "react-native";
import { MutableRefObject } from "react";

export default {
  title: "Tooltip",
  component: Tooltip,
  decorators: [withKnobs]
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
        style={{ border: "1px solid black", width: "200px", height: "100px", padding: 20, margin: 100 }}
      >
        <Tooltip 
          show={isHovered}
          placement={select("direction", ["top", "right", "bottom", "left", "overlay", "inset-bottom-left", "inset-bottom-right", "inset-top-left", "inset-top-right", "cursor"], "top")}
          text="Tooltip text"
          anchorRef={ref}
        />
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
        style={{ border: "1px solid black", width: "200px", height: "100px", padding: 20, margin: 100 }}
      >
        <Tooltip 
          show={isHovered}
          placement={select("placement", ["top", "right", "bottom", "left", "overlay", "inset-bottom-left", "inset-bottom-right", "inset-top-left", "inset-top-right", "cursor"], "top")}
          text="Tooltip text"
          anchorRef={ref}
        >
          <View style={{ flexDirection: "row", width: "100%", height: "100%", alignItems: "center", justifyContent: "space-around" }}>
            <View style={{ border: "1px solid red", backgroundColor: "red" }}>
              <p>L</p>
            </View>
            <View style={{ border: "1px solid blue", backgroundColor: "blue" }}>
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
        style={{ border: "1px solid black", width: "120px", height: "50px", margin: 150 }}
        ref={ref}>
        <p>A Pressable</p>
        <Tooltip 
          show={isHovered}
          placement={select("placement", ["top", "right", "bottom", "left", "overlay", "inset-bottom-left", "inset-bottom-right", "inset-top-left", "inset-top-right", "cursor"], "top")}
          text="Tooltip text"
          anchorRef={ref}
        />
      </Pressable>
    </Hoverable>
  );
}
