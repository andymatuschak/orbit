import { OrderedIDGenerator } from "./orderedID.js";

test("generates predictably", () => {
  const gen1 = new OrderedIDGenerator(() => 0.5);
  const gen2 = new OrderedIDGenerator(() => 0.5);

  expect(gen1.getOrderedID(100)).toEqual(gen2.getOrderedID(100));
  expect(gen1.getOrderedID(100)).toEqual(gen2.getOrderedID(100));
  expect(gen1.getOrderedID(200)).toEqual(gen2.getOrderedID(200));
});

test("generates different IDs at same timestamp using different random generators", () => {
  const gen1 = new OrderedIDGenerator();
  const gen2 = new OrderedIDGenerator();
  expect(gen1.getOrderedID(100)).not.toEqual(gen2.getOrderedID(100));
});

test.each([
  { time: 50, label: "earlier" },
  { time: 100, label: "same" },
  { time: 150, label: "later" },
])("increases output on subsequent calls at $label time", ({ time }) => {
  const getRandom = jest.fn().mockImplementation(() => 0.5);
  const gen = new OrderedIDGenerator(getRandom);
  const first = gen.getOrderedID(100);
  const second = gen.getOrderedID(time);
  expect(first < second).toBe(true);
});

test("rolls over random component to assure monotonicity", () => {
  // We'll generate several hundred values at the same timestamp and assert their monotonicity.
  const gen = new OrderedIDGenerator(() => 0.5);
  let lastString = "\u0000";
  for (let i = 0; i < 500; i++) {
    const newID = gen.getOrderedID(100);
    expect(newID > lastString).toBe(true);
    lastString = newID;
  }
});
