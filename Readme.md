# Orbit

This is the mono-repo for [Orbit](https://withorbit.com).

It uses [Yarn workspaces](https://classic.yarnpkg.com/en/docs/workspaces/) to allow these modules to reference each other. You'll want to run `yarn install` before doing anything else.

## Packages

Orbit is separated into many modular packages.

While everything is written in Typescript, components of Orbit must run in Node, web browsers, and react-native environments, which can require some care. See the table below for an overview, and see Readme files in individual package folders for details on each package.

| Package | Description | Node | Browser | react-native  | License |
| --- | --- | --- | --- | --- | --- |
| _Main packages:_ |
| `core` | Core data structures and operations | ✅ | ✅ | ✅ | APL2 |
| `app` | Orbit client apps and embedded interface | | ✅ | ✅ | AGPL3+ / BUSL1.1 |
| `backend` | Server components of Orbit, including API backend, notifier, logging service, etc | ✅ | | | AGPL3+ / BUSL1.1 |
| `web-component` | Author-facing library for Orbit integration | | ✅ | | APL2 |
| `api` | Interface definitions for Orbit's REST API | ✅ | ✅ | ✅ | APL2 |
| `api-client` | Client implementation of Orbit API | ✅ | ✅ | ✅ | APL2 |
| `ui` | Shared styles and UI components | | ✅ | ✅ | APL2 |
| _Secondary packages:_ |
| `anki-import` | Implements Anki .apkg import | ✅ | | | APL2 |
| `cli` | Miscellaneous administrative scripts | ✅ | | | APL2 |
| `docs` | Orbit's documentation site | | ✅ | | APL2 |
| `embedded-support` | Implementations shared by `app` and `web-component` | | ✅ | ✅ | APL2 |
| `note-sync` | Syncs Orbit prompts from Markdown notes | ✅ | | | APL2 |
| `sample-data` | Sample Orbit data for tests | ✅ | | | APL2 |

## License

Orbit is open-source. We use an unusual licensing strategy intended to be as permissive as possible while discouraging commercial copy-cats. Here's a summary; see the `LICENSE` files and details in each package for more:

* All libraries are provided under Apache 2.0.
* The Orbit client application and cloud service sources are provided under your choice of two licenses:
  * GNU Affero General Public License 3.0 or later (strong copyleft, viral over the network)
  * Business Software License 1.1 ("eventually open source": permits all non-production use, transforms into the permissive Apache 2.0 license after three years)
  * If you're interested in purchasing an alternative license, please [contact me](andy@andymatuschak.org).
* Official compiled binaries of the Orbit applications will be distributed under the Apache 2.0 license (so that [organizations terrified of AGPL](https://opensource.google/docs/using/agpl-policy/) can install the end-user binaries onto their machines).
