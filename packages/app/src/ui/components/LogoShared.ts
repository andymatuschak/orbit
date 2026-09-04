import unreachableCaseError from "../util/unreachableCaseError.js";

export interface LogoProps {
  // This prop specifies the rough size of the logo itself. The logo is set inside an 8px (1 grid unit) bounding box on all sides, since some of the curved elements don't fit in the core size. So a size of 16 will give you an element that is actually 32px high.
  units: 2 | 3 | 4;
  tintColor: string;
}

export function getLogoSize(units: LogoProps["units"]): {
  width: number;
  height: number;
} {
  switch (units) {
    case 2:
      return { width: 59, height: 32 };
    case 3:
      return { width: 80, height: 40 };
    case 4:
      return { width: 102, height: 48 };
    default:
      throw unreachableCaseError(units);
  }
}
