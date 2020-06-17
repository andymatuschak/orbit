// The real implementations are in .native and .web.

import { AbstractLevelDOWNConstructor } from "abstract-leveldown";

class DummyLeveldown {
  constructor() {
    throw new Error(
      "Build configuration issue: leveldown.ts is being use dinstead of leveldown.native.ts or leveldown.web.ts",
    );
  }
}

export default (DummyLeveldown as unknown) as AbstractLevelDOWNConstructor;
