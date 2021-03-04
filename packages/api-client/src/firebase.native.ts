export function getDefaultFirebaseApp(): never {
  throw new Error(
    "Can't get firebase app from client library in native contexts",
  );
}
