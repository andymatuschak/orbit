# Orbit

This is the mono-repo for [Orbit](https://withorbit.com).

It uses [Yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/) to allow these modules to reference each other. You'll want to run `yarn install` before doing anything else.

## Packages

Orbit is separated into many modular packages.

While everything is written in Typescript, components of Orbit must run in Node, web browsers, and react-native environments, which can require some care. See the table below for an overview, and see Readme files in individual package folders for details on each package.

| Package | Description | Node | Browser | react-native  |
| --- | --- | --- | --- | --- |
| _Main packages:_ |
| `core` | Core data structures and operations | ✅ | ✅ | ✅ |
| `app` | Orbit client apps and embedded interface | | ✅ | ✅
| `backend` | Server components of Orbit, including API backend, notifier, logging service, etc | ✅ | | |
| `web-component` | Author-facing library for Orbit integration | | ✅ | |
| `api` | Interface definitions for Orbit's REST API | ✅ | | |
| `api-client` | Client implementation of Orbit API | ✅ | ✅ | ✅ |
| `ui` | Shared styles and UI components | | ✅ | ✅ |
| _Secondary packages:_ |
| `anki-import` | Implements Anki .apkg import | ✅ | | |
| `cli` | Miscellaneous administrative scripts | ✅ | | |
| `docs` | Orbit's documentation site | | ✅ | |
| `embedded-support` | Implementations shared by `app` and `web-component` | | ✅ | ✅ |
| `note-sync` | Syncs Orbit prompts from Markdown notes | ✅ | | |
| `sample-data` | Sample Orbit data for tests | ✅ | | |
