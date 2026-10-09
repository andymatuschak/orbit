export type InternalAPISpec = {
  "/internal/auth/consumeAccessCode": {
    POST: {
      response: string;
    };
  };
  "/internal/auth/personalAccessTokens": {
    POST: {
      response: { token: string };
    };
  };
};
