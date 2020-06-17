jest.mock("../leveldown", () => {
  const Memdown = require("memdown");
  return Memdown;
});
