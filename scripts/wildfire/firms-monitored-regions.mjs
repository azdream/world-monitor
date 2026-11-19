// The NASA FIRMS Area API boxes the wildfire seeder queries, as
// 'west,south,east,north'. Kept free of imports so the border generator
// (scripts/generate-firms-region-borders.mjs) can read the boxes without
// loading the seeder or the border file it is about to write.
//
// The boxes overlap (Iran's covers Basra and the Saudi Gulf coast, North
// Korea's covers Liaoning), so a box is a query area, never a detection's
// country. scripts/wildfire/firms-area.mjs labels each detection from its own
// coordinates and uses a box name only for points in that box's countries.
export const MONITORED_REGIONS = Object.freeze({
  Ukraine: '22,44,40,53',
  Russia: '20,50,180,82',
  Iran: '44,25,63,40',
  'Israel/Gaza': '34,29,36,34',
  Syria: '35,32,42,37',
  Taiwan: '119,21,123,26',
  'North Korea': '124,37,131,43',
  'Saudi Arabia': '34,16,56,32',
  Turkey: '26,36,45,42',
});

// The ISO2 countries each monitored region is named after. A detection inside
// one of these countries keeps the region name the dashboard has always shown;
// a detection anywhere else is labelled with its own country.
export const MONITORED_REGION_COUNTRIES = Object.freeze({
  Ukraine: Object.freeze(['UA']),
  Russia: Object.freeze(['RU']),
  Iran: Object.freeze(['IR']),
  'Israel/Gaza': Object.freeze(['IL', 'PS']),
  Syria: Object.freeze(['SY']),
  Taiwan: Object.freeze(['TW']),
  'North Korea': Object.freeze(['KP']),
  'Saudi Arabia': Object.freeze(['SA']),
  Turkey: Object.freeze(['TR']),
});

/** The monitored boxes as numbers, for geometry code. */
export function monitoredRegionBoxes() {
  return Object.entries(MONITORED_REGIONS).map(([name, bbox]) => {
    const [west, south, east, north] = bbox.split(',').map(Number);
    return { name, west, south, east, north };
  });
}
