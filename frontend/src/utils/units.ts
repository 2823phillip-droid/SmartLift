export type UnitsPreference = "imperial" | "metric";

export const UNITS_STORAGE_KEY = "smartlift_units_preference";

export function getUnitsPreference(): UnitsPreference {
  if (typeof window === "undefined") return "imperial";
  const stored = localStorage.getItem(UNITS_STORAGE_KEY);
  if (stored === "metric" || stored === "imperial") return stored;
  return "imperial";
}

export function setUnitsPreference(pref: UnitsPreference) {
  if (typeof window === "undefined") return;
  localStorage.setItem(UNITS_STORAGE_KEY, pref);
}

export function lbsToKg(lbs: number): number {
  return lbs * 0.45359237;
}

export function kgToLbs(kg: number): number {
  return kg / 0.45359237;
}

export function inchesToCm(inches: number): number {
  return inches * 2.54;
}

export function cmToInches(cm: number): number {
  return cm / 2.54;
}

export function formatWeight(value: number, units: UnitsPreference): string {
  if (units === "imperial") {
    return `${Math.round(kgToLbs(value))} lbs`;
  }
  return `${Math.round(value)} kg`;
}

export function formatHeight(value: number, units: UnitsPreference): string {
  if (units === "imperial") {
    const inches = Math.round(cmToInches(value));
    const feet = Math.floor(inches / 12);
    const remainingInches = inches % 12;
    if (feet > 0) {
      return `${feet}'${remainingInches}"`;
    }
    return `${inches}"`;
  }
  return `${Math.round(value)} cm`;
}

export function weightInputPlaceholder(units: UnitsPreference): string {
  return units === "imperial" ? "lbs" : "kg";
}

export function heightInputPlaceholder(units: UnitsPreference): string {
  return units === "imperial" ? "inches" : "cm";
}
