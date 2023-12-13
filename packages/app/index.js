import "./shims.js";
import { registerRootComponent } from "expo";

import App from "./App.tsx";

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
