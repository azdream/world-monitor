import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { generateFirmsRegionBorders } from '../scripts/generate-firms-region-borders.mjs';
import { FIRMS_BORDER_COUNTRIES, firmsCountryAt } from '../scripts/shared/firms-region-borders.mjs';
import {
  MONITORED_REGION_COUNTRIES,
  MONITORED_REGIONS,
  monitoredRegionBoxes,
} from '../scripts/wildfire/firms-monitored-regions.mjs';

describe('generated FIRMS region border file', () => {
  it('is current with its generator and source map', () => {
    const { stale, bytes } = generateFirmsRegionBorders({ check: true });
    assert.equal(stale, false, 'run node scripts/generate-firms-region-borders.mjs');
    assert.ok(bytes < 200_000, `border file grew to ${bytes} bytes; the wildfire seeder loads it every run`);
  });

  it('names every country a monitored region stands for', () => {
    assert.deepEqual(Object.keys(MONITORED_REGION_COUNTRIES), Object.keys(MONITORED_REGIONS));
    for (const codes of Object.values(MONITORED_REGION_COUNTRIES)) {
      for (const code of codes) assert.ok(FIRMS_BORDER_COUNTRIES.includes(code), `${code} missing from the border file`);
    }
  });

  it('places every point of every monitored box except the open Arctic and Okhotsk seas', () => {
    // A 0.5 degree grid over all nine boxes. Only the Russia box reaches water more
    // than 200 nautical miles from any coast; the seeder labels those points Russia.
    const unplaced = [];
    for (const box of monitoredRegionBoxes()) {
      for (let lat = box.south; lat <= box.north; lat += 0.5) {
        for (let lon = box.west; lon <= box.east; lon += 0.5) {
          if (!firmsCountryAt(lat, lon) && box.name !== 'Russia') unplaced.push(`${box.name} ${lat},${lon}`);
        }
      }
    }
    assert.deepEqual(unplaced, []);
  });
});

describe('firmsCountryAt', () => {
  it('names the country containing a point on land', () => {
    assert.deepEqual(firmsCountryAt(30.5, 47.8), { code: 'IQ', name: 'Iraq' });
    assert.deepEqual(firmsCountryAt(27.0, 49.6), { code: 'SA', name: 'Saudi Arabia' });
    assert.deepEqual(firmsCountryAt(40.13, 124.39), { code: 'CN', name: 'China' });
    assert.deepEqual(firmsCountryAt(51.0, 71.0), { code: 'KZ', name: 'Kazakhstan' });
  });

  it('counts Crimea as Ukraine, as the CII and the map do', () => {
    assert.equal(firmsCountryAt(44.95, 34.1)?.code, 'UA');
  });

  it('gives an offshore point to the nearest coast within 200 nautical miles', () => {
    assert.equal(firmsCountryAt(28.2, 48.85)?.code, 'SA');
    assert.equal(firmsCountryAt(85, 100), null);
  });

  it('rejects coordinates that are not numbers on the globe', () => {
    assert.equal(firmsCountryAt(Number.NaN, 47.8), null);
    assert.equal(firmsCountryAt(30.5, 200), null);
    assert.equal(firmsCountryAt('30.5', 47.8), null);
  });
});
