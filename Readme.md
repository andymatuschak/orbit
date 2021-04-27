# Orbit

Orbit is an experimental platform for publishing and engaging with small tasks repeatedly over time. More concretely, it's currently focused on helping people deeply internalize ideas by returning to them over time. Another angle: Orbit aspires to offer a more general form of spaced repetition systems like [Anki](https://apps.ankiweb.net), as part of a connected cloud service. Learn more on the [home page](https://withorbit.com).

Orbit is a (nascent) ecosystem. At its core are decentralized data structures defining tasks, review actions, and scheduling algorithms. Tasks can be ingested from around the web, via APIs or embedded iframes, or through various services running on your local computer. You can complete scheduled tasks in desktop, mobile, and web applications. A backend service syncs user data and orchestrates notifications.

You should also understand that Orbit is (for now) first and foremost a vehicle for research. We hope that it's useful, of course, but the main goal is not implementing features or polishing loose screws. We're focused on trying to understand the scope of systems like this, and what they one day want to become.

If you’re an author interested in using Orbit in your own texts, please view [the preliminary documentation](https://docs.withorbit.com).

## Packages

This is Orbit's mono-repo, comprising many modular packages. You'll want to run `yarn install` in the root to install dependencies before doing anything else.

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

## Contributing

Thank you for your interest in contributing!

Orbit's just been open-sourced; we haven't yet created consistent processes and venues for discussing ongoing development plans. Those will come (hopefully) soon!

Please understand that (for now), Orbit does not aspire to be a typical open-source project, soliciting open-ended contributions and participation from a large community. Orbit is primarily a vehicle for research; its direction is determined by [Andy Matuschak](https://andymatuschak.org) and direct collaborators. We'll strive to keep the process open to input and relatively transparent. But open-source community engagement can be extremely time-consuming, and we have to keep our focus on the research.

That said, we're excited to work with serious contributors! Let's just get to know each other, ease into the relationship. If you're interested in participating, a great way to start would be by engaging with existing issues on GitHub, particularly [those marked "help wanted."](https://github.com/andymatuschak/orbit/issues?q=is%3Aopen+is%3Aissue+label%3A%22🚩+Help+wanted%22) If you're game for implementing something substantial that we've been putting off, we'll be excited to invest time into a collaboration. If you find a bug in Orbit, we'd be grateful for issues with accompanying pull requests. If you'd like to contribute substantively but you're not sure how to start, please [email Andy](andy@andymatuschak.org).

One more thing: as with many open-source projects, you'll need to sign a [Contributor Agreement](https://gist.github.com/andymatuschak/f8039975eabb52098745d2bfa8288ba2) to contribute to Orbit. A bot will prompt you to do this when you open your first pull request. The agreement asks you to jointly assign copyright; that is, you retain all your own rights to the contribution, but share them with us. And we pledge that any derivative works will always be released under an FSF/OSI-approved license. See [this FAQ](https://www.oracle.com/technetwork/oca-faq-405384.pdf) if you have questions (our agreement is the same as Oracle's, but with names swapped).

## License

Orbit is open-source. We use an unusual licensing strategy intended to be as permissive as possible while discouraging commercial copy-cats. Here's a summary; see the `LICENSE` files and details in each package for more:

* All libraries are provided under the permissive [Apache License 2.0](https://github.com/andymatuschak/orbit/blob/master/LICENSE-Apache-2.0).
* The Orbit client application and cloud service sources are provided under your choice of two licenses:
  * [GNU Affero General Public License 3.0 or later](https://github.com/andymatuschak/orbit/blob/master/LICENSE-AGPL-3.0-or-later) (strong copyleft, viral over the network)
  * [Business Software License 1.1](https://github.com/andymatuschak/orbit/blob/master/LICENSE-BUSL-1.1) ("eventually open source": permits all non-production use, transforms into the permissive [Apache License 2.0](https://github.com/andymatuschak/orbit/blob/master/LICENSE-Apache-2.0) after three years)
  * If you're interested in purchasing an alternative license, please [contact me](mailto:andy@andymatuschak.org).
* Official compiled binaries of the Orbit applications will be distributed under the [Apache License 2.0](https://github.com/andymatuschak/orbit/blob/master/LICENSE-Apache-2.0) (so that [organizations terrified of AGPL](https://opensource.google/docs/using/agpl-policy/) can install the end-user binaries onto their machines).

## Acknowledgements

Orbit was created by [Andy Matuschak](https://andymatuschak.org). It continues to develop the concept of the "[mnemonic medium](https://numinous.productions/ttft)" co-created with [Michael Nielsen](https://michaelnielsen.org). Orbit is a free service; our Patreon community helps it stay that way. You can [become a member](https://patreon.com/quantumcountry) to support the work, and to read regular patron-only articles and previews of upcoming projects.

Special thanks to our sponsor-level patrons: [Adam Marblestone](http://www.adammarblestone.org),  [Adam Wiggins](https://twitter.com/hirodusk),  [Andrew Sutherland](https://asuth.com/),  [Anil Varanasi](https://anilv.com), [Ben Springwater](https://twitter.com/benspringwater), [Bert Muthalaly](http://somethingdoneright.net/),  Boris Verbitsky, [Calvin French-Owen](http://calv.info/),  [Dwight Crow](https://www.linkedin.com/in/dwight-crow-73122621),  [fnnch](https://fnnch.com/),  [James Hill-Khurana](https://jameshk.com/),  [Kevin Lynagh]([Kevin Lynagh](https://kevinlynagh.com/)), [Lambda AI Hardware](https://lambdalabs.com/),  [Ludwig Petersson](https://twitter.com/ludwig),  [Mickey McManus](http://www.t-1ventures.com/),  [Mintter](http://mintter.com/),  [Patrick Collison](https://patrickcollison.com/), Paul Sutter,  [Peter Hartree](https://peterhartree.co.uk/), [The Public Domain Publishing Company](https://publicdomaincompany.com),  [Russel Simmons](https://github.com/rsimmons/), [Sana Labs](https://www.sanalabs.com/),  [Tim O’Reilly](https://www.oreilly.com/tim/), Todor Markov, [Yaniv Tal](https://twitter.com/yanivgraph).
