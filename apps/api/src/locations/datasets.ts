import us from "../../data/locations/us.json";
import ca from "../../data/locations/ca.json";

export type CountryCode2 = "US" | "CA";

export type RegionDataset = {
  country: CountryCode2;
  regions: Array<{
    regionCode: string;
    regionName: string;
    cities: string[];
  }>;
};

const US = us as unknown as RegionDataset;
const CA = ca as unknown as RegionDataset;

export function getRegionDatasets(): RegionDataset[] {
  return [US, CA];
}

export function getRegionName(country: CountryCode2, regionCode: string): string | null {
  const rc = regionCode.trim().toUpperCase();
  const dataset = country === "CA" ? CA : US;
  const found = dataset.regions.find((r) => r.regionCode.toUpperCase() === rc);
  return found?.regionName ?? null;
}

export function getCitiesForRegion(country: CountryCode2, regionCode: string): string[] {
  const rc = regionCode.trim().toUpperCase();
  const dataset = country === "CA" ? CA : US;
  const found = dataset.regions.find((r) => r.regionCode.toUpperCase() === rc);
  return found?.cities ?? [];
}

