# orbit-cloud-functions

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
