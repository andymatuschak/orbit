export type InternalAPISpec = {
  "/internal/auth/consumeAccessCode": {
    GET: {
      response: string;
    };
  };
  "/internal/auth/personalAccessTokens": {
    POST: {
      response: { token: string };
    };
  };
};
