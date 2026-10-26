export const LOCATION_TYPES = ["YARD", "WORKSHOP", "SITE"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const LOCATION_TYPE_LABELS: Readonly<Record<LocationType, string>> = {
  YARD: "Tại bãi",
  WORKSHOP: "Tại xưởng",
  SITE: "Tại công trình",
};
