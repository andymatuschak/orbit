import { ValidatableSpec } from "../orbitAPI";
import OrbitAPISchema from "../orbitAPISchema.json" assert { type: "json" };
import { AjvAPIValidator, AjvAPIValidatorConfig } from "./ajvAPIValidator";

export class OrbitAPIValidator extends AjvAPIValidator<ValidatableSpec> {
  constructor(config: AjvAPIValidatorConfig) {
    super(config, OrbitAPISchema);
  }
}
