import React, { createContext, useContext } from "react";
import {
  getReviewStrings,
  OrbitLocale,
  resolveOrbitLocale,
  ReviewStrings,
} from "./localization.js";

const OrbitLocaleContext = createContext<OrbitLocale>("en");

export function OrbitLocaleProvider({
  locale,
  children,
}: {
  locale?: string | null;
  children: React.ReactNode;
}) {
  return (
    <OrbitLocaleContext.Provider value={resolveOrbitLocale(locale)}>
      {children}
    </OrbitLocaleContext.Provider>
  );
}

export function useOrbitLocale(): OrbitLocale {
  return useContext(OrbitLocaleContext);
}

export function useReviewStrings(): ReviewStrings {
  return getReviewStrings(useOrbitLocale());
}
