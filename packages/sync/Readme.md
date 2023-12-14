# `@withorbit/sync`

This package implements bidirectional syncing of `OrbitStore`s with a server (via `@withorbit/api-client` and `APISyncAdapter`) or another `OrbitStore` (via `OrbitStoreSyncAdapter`).

To download or sync an on-disk store to/from the Orbit server from the command line, run `bun run sync`. Usage:
* To sync the data of the default test user against a local emulated server:
  * ```ORBIT_TOKEN=TEST bun run sync myData.orbitStore```
  * If `myData.orbitStore` doesn't already exist, it will be created from the server's data.
  * (this user has email `test@test.com` and password `test`)
* To sync against a production user:
  * Get a personal access token for your user (which you can generate by visiting `/settings?action=generatePersonalAccessToken` while logged in).
  * Then run `ORBIT_ENV=production ORBIT_TOKEN=yourOrbitToken bun run sync someDataStore.orbitStore`

Typical programmatic usage:
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
