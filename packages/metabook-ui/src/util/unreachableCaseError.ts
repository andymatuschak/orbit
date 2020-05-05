export default function unreachableCaseError(witness: never): Error {
  return new Error("unreachable");
}
