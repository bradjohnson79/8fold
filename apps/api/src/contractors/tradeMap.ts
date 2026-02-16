export function tradeEnumToCategoryKey(trade: string): string {
  switch (trade) {
    case "JUNK_REMOVAL":
      return "junk removal";
    case "YARDWORK_GROUNDSKEEPING":
      return "yardwork / groundskeeping";
    case "CARPENTRY":
      return "carpentry";
    case "DRYWALL":
      return "drywall";
    case "ROOFING":
      return "roofing";
    case "PLUMBING":
      return "plumbing";
    case "ELECTRICAL":
      return "electrical";
    case "WELDING":
      return "welding";
    default:
      return "plumbing";
  }
}

// AUTHORITATIVE v1 (LOCKED) — canonical trade categories used for eligibility and auditing.
export function tradeEnumToTradeCategories(trade: string): string[] {
  switch (trade) {
    case "PLUMBING":
      return ["PLUMBING"];
    case "ELECTRICAL":
      return ["ELECTRICAL"];
    case "DRYWALL":
      return ["DRYWALL"];
    case "ROOFING":
      return ["ROOFING"];
    case "CARPENTRY":
      return ["CARPENTRY"];
    case "JUNK_REMOVAL":
      return ["JUNK_REMOVAL"];
    case "YARDWORK_GROUNDSKEEPING":
      return ["LANDSCAPING"];
    // Legacy trade not in v1 list; keep contractor eligible under HANDYMAN.
    case "WELDING":
      return ["HANDYMAN"];
    default:
      return ["HANDYMAN"];
  }
}

export function serviceTypeToTradeCategory(serviceType: string): string {
  const s = serviceType.trim().toLowerCase();
  if (s.includes("plumb")) return "PLUMBING";
  if (s.includes("elect")) return "ELECTRICAL";
  if (s.includes("hvac")) return "HVAC";
  if (s.includes("appliance")) return "APPLIANCE";
  if (s.includes("drywall")) return "DRYWALL";
  if (s.includes("roof")) return "ROOFING";
  if (s.includes("paint")) return "PAINTING";
  if (s.includes("carpen") || s.includes("trim") || s.includes("cabinet")) return "CARPENTRY";
  if (s.includes("clean")) return "JANITORIAL_CLEANING";
  if (s.includes("landscap") || s.includes("yard") || s.includes("mulch")) return "LANDSCAPING";
  if (s.includes("fence")) return "FENCING";
  if (s.includes("snow")) return "SNOW_REMOVAL";
  if (s.includes("junk")) return "JUNK_REMOVAL";
  if (s.includes("move") || s.includes("moving")) return "MOVING";
  if (s.includes("auto") || s.includes("vehicle")) return "AUTOMOTIVE";
  return "HANDYMAN";
}

