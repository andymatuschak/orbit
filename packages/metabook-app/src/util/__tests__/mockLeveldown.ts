jest.mock("../leveldown", () => {
  const Memdown = require("memdown");
  return Memdown;
});

export default {}; // Force interpretation as a module.
