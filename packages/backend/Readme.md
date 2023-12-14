# backend

This module contains the backend server for Orbit.

It's currently built for deployment on Firebase Cloud Functions. The entry points for those functions are all stored in `/functions`. But I'm trying to rely on Firebase-specific GCP-specific environment elements as little as possible, so that Orbit can be self-hosted at some point.

To that end, most of the important elements are implemented as a normal REST API, routed via Express, in `/api`. Those endpoint implementations don't know about Firebase or GCP and call into service objects which encapsulate the cloud provider API calls.

## Usage

* To build the backend: `bun run build`
* To run the local backend emulator: `bun run dev`
  * Note that this includes a test user: `test@test.com` with password `testtest`. This user has a personal access token configured with value: `TEST`.
* To run the tests: `bun run test`
* To deploy the functions: `bun run deploy`

## Configuration

`/serviceConfig.ts` contains `withorbit.com`-specific configuration you'll need to change if self-hosting.

We use Mailjet for email notifications. We store the secrets using Firebase's configuration feature. To set your keys:

```
firebase functions:config:set mailjet.api_key="THE API KEY" mailjet.secret_key="THE SECRET KEY"
```

We store logs in BigQuery. The Cloud Functions execution environment provides the necessary configuration, but you'll need to create a few tables with the appropriate schemas. See `/bigQuerySchemas`.

To help preserve user privacy, we track page views ourselves in BigQuery rather than using an external analytics provider like Google Analytics. We don't use cookies to track user sessions; we create virtual sessions via IP and user agent characteristics. Those details are hashed with a salt, which you should set using:

```
firebase functions:config:set logging.session_id_hash_salt="YOUR SALT"
```

Once you've set your configuration parameters, it's convenient to store them locally (in a file not committed to Git) so that the Firebase emulators can access them:

```
firebase functions:config:get > .runtimeconfig.json
```

## Development

Exporting a BigQuery table's schema:
```
bq show --schema --format=prettyjson logs.TABLE_NAME > bigQuerySchemas/TABLE_NAME.json
```

---

```
Copyright 2020 Andy Matuschak
SPDX-License-Identifier: AGPL-3.0-or-later OR BUSL-1.1
```
