import { styles } from "@withorbit/ui";
import React from "react";
import CreateForm from "./CreateForm";

const colorPalette = styles.colors.palettes.orange;

export default function App() {
  const onSubmit = () => console.log("Submit");

  return (
    <CreateForm
      onSubmit={onSubmit}
      isPendingServerResponse={false}
      colorPalette={colorPalette}
    />
  );
}
