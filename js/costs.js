// Default installed prices (USD, 2026 US mid-range averages) for the estimate.
// Sources: Angi / HomeGuide / LawnStarter / Lawn Love 2026 cost guides —
// tree planting avg $540–645; shrubs $25–85; paver patios $12–30/sq ft;
// pergolas $4k+; fire pits $200–7,000; ponds avg ~$3,400; fountains $1,100–7,500;
// stone garden walls $20–340/lin ft; concrete walls $60–240/lin ft;
// bark mulch ~$77+/cu yd installed. Every number here is a starting point —
// landscapers can click any price in the panel to use their own.
export const UNIT_COSTS = {
  oak: 550, pine: 450, cypress: 250, palm: 600, maple: 650, birch: 400, jacaranda: 600,
  shrub: 65, hedge: 90, flowers: 250, grasstuft: 45, rose: 70, lavender: 35,
  boulder: 350, stepstones: 150, gravel: 175,
  patio: 1500, wall: 350, path: 400,
  fence: 220, pergola: 4000, raisedbed: 350, arch: 450, bench: 400, firepit: 900,
  pond: 3400, fountain: 2800, birdbath: 250,
  lamp: 250, pot: 150,
};

// Suggested $ per linear foot for drawn items; the computed figure pre-fills
// the cost field, and the landscaper can overwrite it per item.
export const CURVE_RATES = {
  rockwall: 60,   // low dry-stack stone garden wall
  concwall: 70,   // short poured/block concrete wall
  walkway: 40,    // ~4 ft wide concrete walk (~$10/sq ft)
};

// $ per square foot for painted ground materials that get estimated.
// Grass is deliberately absent: the whole lot starts as grass, so it is
// treated as existing lawn and only changed ground is billed.
// Mulch/bark ~$77–120/cu yd installed at 3" depth (~108 sq ft coverage);
// decorative stone/gravel ~$1.50–2/sq ft; topsoil and sand spread ~$0.75.
export const PAINT_RATES = {
  'Soil': 0.75,
  'Mulch': 1.00,
  'Stone': 1.75,
  'Sand': 0.75,
  'Beauty bark': 1.25,
};

// Not part of a landscaping estimate.
export const EXCLUDED_CATS = new Set([
  'Homes — single story', 'Homes — two story', 'Outbuildings', 'Commercial',
]);
export const EXCLUDED_TYPES = new Set(['driveway', 'driveway-a']);
