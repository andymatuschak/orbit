jest.mock("../leveldown", () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Memdown = require("memdown");
  return Memdown;
});

export default {}; // Force interpretation as a module.
