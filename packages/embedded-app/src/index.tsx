import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import Login from "./Login";
import * as serviceWorker from "./serviceWorker";

// Doing lazy routing for now.
let rootElement: React.ReactElement;
if (window.location.pathname === "/login") {
  rootElement = <Login />;
} else {
  rootElement = <App />;
}
ReactDOM.render(rootElement, document.getElementById("root"));

// TODO: think through and implement service worker for embedded-app
serviceWorker.unregister();
