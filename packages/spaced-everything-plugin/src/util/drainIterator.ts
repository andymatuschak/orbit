import { AbstractIterator } from "abstract-leveldown";

export default function drainIterator<K, V>(
  iterator: AbstractIterator<K, V>,
): Promise<[K, V][]> {
  return new Promise((resolve, reject) => {
    const output: [K, V][] = [];

    function next(error: Error | undefined, key: K, value: V) {
      if (error) {
        reject(error);
      } else if (!key && !value) {
        iterator.end(() => {
          resolve(output);
        });
      } else {
        output.push([key, value]);
        iterator.next(next);
      }
    }

    iterator.next(next);
  });
}
