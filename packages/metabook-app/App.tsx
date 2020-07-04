import "./src/util/nodeShims";

import React from "react";
import { initializeReporter } from "./src/errorReporting/reporter";

import Root from "./src/Root";

export default function App() {
  React.useEffect(() => {
    initializeReporter();
  }, []);

  return <Root />;
}
