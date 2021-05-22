import { ValidatableSpec } from "@withorbit/api/src/orbitAPI";
import OrbitAPISchema from "@withorbit/api/src/orbitAPISchema.json";
import { AjvAPIValidator, AjvAPIValidatorConfig } from "./ajvAPIValidator";

export class OrbitAPIValidator extends AjvAPIValidator<ValidatableSpec> {
  constructor(config: AjvAPIValidatorConfig) {
    super(config, OrbitAPISchema);
  }
}
