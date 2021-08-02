# `@withorbit/sync`

This package implements bidirectional syncing of `OrbitStore`s with a server (via `@withorbit/api-client` and `APISyncAdapter`) or another `OrbitStore` (via `OrbitStoreSyncAdapter`).

Typical usage:
```
import {APISyncAdapter, syncOrbitStore} from "@withorbit/sync"

const apiSyncAdapter = new APISyncAdapter(apiClient, "my_server_name");
await syncOrbitStore(store, apiSyncAdapter);
```

Compatible with browser, Node.js and React Native environments.

```
Copyright 2021 Andy Matuschak
SPDX-License-Identifier: Apache-2.0
```
