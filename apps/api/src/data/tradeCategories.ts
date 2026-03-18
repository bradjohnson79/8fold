/**
 * 25 contractor trade categories with keyword variations for search queries.
 * Primary keyword (index 0) used for the main search; others used for broader scraping.
 */
export const TRADE_CATEGORIES: Record<string, string[]> = {
  "Roofing":                ["roofing contractor", "roof repair", "roof replacement", "roof installation"],
  "HVAC":                   ["HVAC contractor", "heating and cooling", "air conditioning repair", "furnace repair"],
  "Electricians":           ["electrician", "electrical contractor", "electrical repair", "licensed electrician"],
  "Plumbing":               ["plumbing contractor", "plumber", "pipe repair", "drain cleaning"],
  "General Contractors":    ["general contractor", "construction company", "home builder", "commercial contractor"],
  "Remodeling":             ["remodeling contractor", "home renovation", "kitchen renovation", "bathroom renovation"],
  "Flooring":               ["flooring contractor", "hardwood floors", "tile installation", "carpet installation"],
  "Painting":               ["painting contractor", "interior painting", "exterior painting", "house painter"],
  "Concrete":               ["concrete contractor", "concrete repair", "concrete driveway", "concrete foundation"],
  "Landscaping":            ["landscaping company", "landscape contractor", "lawn care", "yard maintenance"],
  "Tree Services":          ["tree service", "tree removal", "tree trimming", "arborist"],
  "Fence Installation":     ["fence contractor", "fence installation", "fence repair", "wood fence"],
  "Solar Installation":     ["solar contractor", "solar panel installation", "solar company", "solar installer"],
  "Garage Door Services":   ["garage door repair", "garage door installation", "garage door company"],
  "Handyman":               ["handyman service", "handyman contractor", "home repair handyman"],
  "Kitchen Remodeling":     ["kitchen remodeling", "kitchen renovation contractor", "kitchen cabinet installation"],
  "Bathroom Remodeling":    ["bathroom remodeling", "bathroom renovation contractor", "bathroom tile"],
  "Deck & Patio Builders":  ["deck builder", "patio contractor", "deck installation", "deck repair"],
  "Drywall":                ["drywall contractor", "drywall repair", "sheetrock installation"],
  "Siding":                 ["siding contractor", "siding installation", "vinyl siding", "siding repair"],
  "Janitorial Services":    ["janitorial service", "commercial cleaning", "office cleaning", "building cleaning"],
  "Furniture Assembly":     ["furniture assembly service", "furniture installer", "IKEA assembly"],
  "Welding":                ["welding contractor", "metal fabrication", "welder", "welding service"],
  "Junk Removal":           ["junk removal service", "debris removal", "hauling service", "trash removal"],
  "Moving Services":        ["moving company", "local movers", "moving service", "residential movers"],
};

/** Returns a URL-friendly slug for a trade name */
export function tradeToSlug(trade: string): string {
  return trade.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
