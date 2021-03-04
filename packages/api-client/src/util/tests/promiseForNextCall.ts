export function promiseForNextCall<Y>(fn: jest.Mock): Promise<Y> {
  return new Promise(resolve => fn.mockImplementation(resolve));
}
