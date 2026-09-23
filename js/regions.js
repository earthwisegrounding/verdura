// Region editions of Verdura. Each region defines its branding, which palette
// assets it offers (with region-appropriate display names), its ground paints,
// pricing, and starter scene. The PNW edition keeps the full catalog; the
// Colorado edition is curated to model-backed, realistic assets only.
export const REGIONS = {
  pnw: {
    brand: 'Verdura',
    title: 'Verdura — Landscape Studio',
    // null = include the full ASSETS/CURVES catalogs unchanged
    include: null,
    renames: {},
    curves: null,
    paints: null,
    prices: {},
    paintRates: {},
    starter: 'pnw',
  },
  co: {
    brand: 'Verdura Colorado',
    title: 'Verdura Colorado — Landscape Studio',
    // strictly realistic, model-backed assets — no procedural-only items
    include: [
      // trees
      'bluespruce', 'aspen', 'pine', 'dougfir', 'oak', 'jacaranda', 'cypress',
      // shrubs, perennials & xeric plants
      'shrub', 'hedge', 'yucca', 'juniper', 'lupine', 'columbine', 'lavender',
      // hardscape
      'boulder', 'patio', 'path', 'stepstones',
      // structures
      'farmhouse', 'colonial', 'barn', 'shed', 'bench', 'firepit', 'pergola',
    ],
    icons: { shrub: '🌿', aspen: '🌳', oak: '🌰' },
    renames: {
      pine: 'Lodgepole pine',
      dougfir: 'Douglas fir',
      oak: 'Gambel oak',
      jacaranda: 'Plains cottonwood',
      cypress: 'Arborvitae',
      juniper: 'Rocky Mountain juniper',
      shrub: 'Big sagebrush',
      hedge: 'Boxwood hedge',
      path: 'Flagstone path',
      farmhouse: 'Craftsman home',
      colonial: 'Two-story home',
    },
    curves: ['rockwall', 'stonewall', 'fencedraw', 'walkway', 'driveway', 'driveway-a', 'drycreek'],
    paints: [
      { name: 'Turf grass',    c: '#5d9e4c', tex: 'grass' },
      { name: 'Soil',          c: '#7a5230' },
      { name: 'Mulch',         c: '#5b4232' },
      { name: 'Rock mulch',    c: '#98938b', tex: 'rockmulch' },
      { name: 'Crusher fines', c: '#c4a883', tex: 'crusherfines' },
    ],
    // Front Range installed pricing (labor runs a bit above national average)
    prices: {
      bluespruce: 450, aspen: 300, pine: 300, dougfir: 300, oak: 350,
      jacaranda: 300, cypress: 180,
      shrub: 60, hedge: 90, yucca: 75, juniper: 250, lupine: 45, columbine: 40, lavender: 40,
      boulder: 400, patio: 1600, path: 450, stepstones: 160,
      bench: 400, firepit: 950, pergola: 4200,
    },
    paintRates: { 'Rock mulch': 1.5, 'Crusher fines': 1.0, 'Mulch': 1.0 },
    starter: 'co',
  },
};

export function activeRegion() {
  const id = (typeof window !== 'undefined' && window.__VERDURA_REGION) || 'pnw';
  return { id, ...REGIONS[id] };
}
