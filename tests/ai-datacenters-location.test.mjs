import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { feature } from 'topojson-client';

import { AI_DATA_CENTERS } from '../src/config/ai-datacenters.ts';

const PRECISIONS = new Set(['site', 'city', 'region', 'country']);

// Dataset country names that differ from the Natural Earth names in countries-50m.json.
const BOUNDARY_NAME = {
  'Korea (Republic of)': 'South Korea',
  'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
};

const topology = JSON.parse(readFileSync(new URL('../public/data/countries-50m.json', import.meta.url), 'utf8'));
const boundaries = new Map();
for (const country of feature(topology, topology.objects.countries).features) {
  const list = boundaries.get(country.properties.name) ?? [];
  list.push(country);
  boundaries.set(country.properties.name, list);
}

describe('AI datacenter location metadata', () => {
  it('declares how precise every map point is', () => {
    for (const dc of AI_DATA_CENTERS) {
      assert.ok(PRECISIONS.has(dc.locationPrecision), `${dc.id} (${dc.name}) has no valid locationPrecision`);
      assert.match(dc.metadataReviewedAt ?? '', /^\d{4}-\d{2}-\d{2}$/, `${dc.id} needs metadataReviewedAt`);
      assert.ok(dc.description, `${dc.id} must explain what its map point represents`);
    }
  });

  it('places every map point inside its own country', () => {
    for (const dc of AI_DATA_CENTERS) {
      const shapes = boundaries.get(BOUNDARY_NAME[dc.country] ?? dc.country);
      assert.ok(shapes, `${dc.id}: no boundary for ${dc.country}`);
      const point = [dc.lon, dc.lat];
      assert.ok(
        shapes.some((shape) => booleanPointInPolygon(point, shape)),
        `${dc.id} (${dc.name}) at ${dc.lat}, ${dc.lon} is outside ${dc.country}`,
      );
    }
  });

  it('cites a source for every South Korean site- or city-level point', () => {
    for (const dc of AI_DATA_CENTERS.filter((entry) => entry.country === 'Korea (Republic of)')) {
      if (dc.locationPrecision === 'site' || dc.locationPrecision === 'city') {
        assert.ok(dc.sourceUrl, `${dc.id} needs a source for a ${dc.locationPrecision}-level location`);
      }
    }
  });
});
