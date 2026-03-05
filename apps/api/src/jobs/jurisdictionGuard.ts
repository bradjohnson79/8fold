const CA_PROVINCES = [
  "BC","AB","SK","MB","ON","QC","NB","NS","PE","NL","YT","NT","NU",
];
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL",
  "IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE",
  "NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD",
  "TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

export function deriveCountryFromRegion(regionCode: string | null | undefined): "CA" | "US" | null {
  const code = (regionCode ?? "").trim().toUpperCase();
  if (CA_PROVINCES.includes(code)) return "CA";
  if (US_STATES.includes(code)) return "US";
  return null;
}
