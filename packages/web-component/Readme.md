# web-component

This module is a lightweight script which publishers can use to embed Orbit prompts into their web pages.

The API is structured via [Web Components](https://developer.mozilla.org/en-US/docs/Web/Web_Components). The Orbit interface itself is loaded from `withorbit.com` via an `iframe` so that Orbit credentials can (sometimes) be shared as users browse the web.

For usage details, see [the Orbit documentation](https://docs.withorbit.com).

## Deployment

This package is built into a single ES Module and deployed to a separate Firebase hosting site (`js.withorbit.com`) which permits cross-origin script execution.

* To build: `bun run build`
* To run a local test server: `bun run dev` (then visit http://localhost:3000)
* To deploy: `bun run deploy`

```
Copyright 2020 Andy Matuschak
SPDX-License-Identifier: Apache-2.0
```
