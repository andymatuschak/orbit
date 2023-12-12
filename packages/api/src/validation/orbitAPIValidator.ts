import { ValidatableSpec } from "../orbitAPI.js";
import OrbitAPISchema from "../orbitAPISchema.json" assert { type: "json" };
import { AjvAPIValidator, AjvAPIValidatorConfig } from "./ajvAPIValidator.js";

export class OrbitAPIValidator extends AjvAPIValidator<ValidatableSpec> {
  constructor(config: AjvAPIValidatorConfig) {
    super(config, OrbitAPISchema);
  }
}
