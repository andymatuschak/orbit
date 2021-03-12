# backend

This module contains the "serverless" backend for Orbit, implemented as Firebase Functions. The entry points for those functions are all stored in `/functions`.

## Development

* To build the functions: `yarn build`
* To run the tests: `yarn test`
* To deploy the functions: `yarn test`

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
