# @withorbit/core

This package defines Orbit's core data structures, like `Event` and `Task`. It also defines some convenience functionality used by many other components.

To support offline-first workflows, Orbit is built using an event sourcing model, meaning that events (like "remembered this task") are the source of truth. These events are combined with an "event reducer" to compute the state of an object at any given time.

This package runs on Node.js, browser, and React Native environments. 

* To build: `bun run build`
* To run tests: `bun run test`

```
Copyright 2020 Andy Matuschak
SPDX-License-Identifier: Apache-2.0
```
