// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function unreachableCaseError(witness: never): Error {
  return new Error("unreachable");
}
