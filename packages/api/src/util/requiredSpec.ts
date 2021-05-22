/**
 * Converts a nested Spec object with optional HTTP methods and routes to be required. For example:
 * ```
 * type Spec = RequiredSpec<{
 *  "/hello"?: {
 *    GET?: {
 *      query: { name: string };
 *      response?: string;
 *    }
 *  }
 * }>
 * // is equivalent too
 * type Spec = RequiredSpec<{
 *  "/hello": {
 *    GET: {
 *      query: { name: string };
 *      response: string;
 *    }
 *  }
 * }>
 * ```
 */
export type RequiredSpec<T> = Required<NestedRequired<T>>;

type NestedRequired<T> = {
  [P in keyof T]: Required<NestedRequiredWithoutRecursion<T[P]>>;
};

type NestedRequiredWithoutRecursion<T> = {
  [P in keyof T]: Required<T[P]>;
};
