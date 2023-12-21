# @withorbit/app

This package contains the main Orbit GUI app for the web, iOS, Android, and macOS. It's built [React Native](https://reactnative.dev) (via [Expo](https://docs.expo.io) with [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)); the web app is built with [react-native-web](https://github.com/necolas/react-native-web).

* Local development
    * First, make sure all the libraries are built by running `bun install && bun run build` from the monorepo root.
    * Install [`watchman`](https://facebook.github.io/watchman/docs/nodejs.html) with `brew install watchman` (the pure-JS file watcher will run out of file handles).
    * Start up a local instance of the backend: see `packages/backend/Readme.md` for details.
    * To run the Orbit web app: `bun run web`
    * To run the Orbit iOS app on the simulator: `bun run ios`
       * (You'll need to `cd ios; EXPO_USE_SOURCE=1 pod install` first; see [this issue](https://github.com/expo/expo/issues/12040) for background on the Expo workaround)
    * To run the Orbit iOS app on an attached device: `bun run ios --device [device name]`
    * To run the Orbit macOS app:
      * Run `bunx expo prebuild -p ios` to generate the iOS project.
      * Run `bun run start` to start the Metro bundler.
      * Open the Xcode workspace, change the device to "My Mac", and run.
* Deployment
    * To deploy the Orbit web app: `bun run deploy:web`

Unsure what a device's name is? Run `xctrace list devices`.

You'll need to copy Orbit's commercial fonts into `/web/fonts` and `/android/app/src/main/assets`. Those fonts are non-free, and their licenses don't permit me to distribute them with the repository. For your local testing purposes only, you can find a demo distribution of the primary interface font, Dr, [here](https://www.productiontype.com/family/dr).

(At some point we should probably make a "no-trade-dress" flag you can set to get a "generic" build of Orbit.)

---

```
Copyright 2020 Andy Matuschak
SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1
```
