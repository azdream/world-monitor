#!/usr/bin/env node
// Generates scripts/shared/firms-region-borders.data.mjs: the country borders
// the wildfire seeder uses to name the country of each NASA FIRMS detection
// (scripts/shared/firms-region-borders.mjs reads it).
//
// The FIRMS monitored boxes overlap and spill into neighbours: the Iran box
// covers Basra and the Saudi Gulf coast, and the North Korea box covers
// Liaoning. A detection's country therefore has to come from its coordinates,
// and every country those boxes touch needs a named border, not only the CII
// Tier-1 countries scripts/shared/cii-country-borders.data.mjs names.
//
// Source: public/data/countries-50m.json, the Natural Earth 1:50m admin-0
// TopoJSON the map already ships, decoded and simplified with the CII
// generator's own helpers. Every polygon with a point within MARGIN_DEG of a
// monitored box is kept; the margin also keeps the coasts the offshore
// fallback in the reader measures against. Polygons far from every box are
// dropped, since FIRMS never returns a detection there.
//
// Attribution rules that differ from the source file, matching the CII and the map:
// - Crimea counts as Ukraine (Natural Earth 1:50m draws it inside Russia).
// - Northern Cyprus counts as Cyprus, and Kosovo is XK; the source gives
//   neither an ISO 3166 numeric id.
//
// Usage: node scripts/generate-firms-region-borders.mjs [--check]

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COAST_TOLERANCE_DEG,
  CRIMEA_BOX,
  RUSSIA_NUMERIC_ID,
  SIMPLIFY_TOLERANCE_DEG,
  decodeArcs,
  geometryPolygons,
  insideBox,
  polygonBox,
  simplifyArc,
} from './generate-cii-country-borders.mjs';
import { MONITORED_REGION_COUNTRIES, monitoredRegionBoxes } from './wildfire/firms-monitored-regions.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_PATH = 'public/data/countries-50m.json';
const UN_TO_ISO2_PATH = 'scripts/shared/un-to-iso2.json';
// An inline ES module, not JSON, for the same reason as the CII border file:
// plain Node seeders throw on a bare JSON import.
export const FIRMS_REGION_BORDERS_PATH = 'scripts/shared/firms-region-borders.data.mjs';

// Keep polygons this close to a monitored box. Four degrees is at least the
// reader's 200-nautical-mile offshore limit (3.35 degrees of latitude) at the
// latitudes where the boxes have open sea, so the nearest coast of any
// offshore detection is always in the file.
export const MARGIN_DEG = 4;

// Natural Earth features with no ISO 3166 numeric id.
const FEATURES_WITHOUT_NUMERIC_ID = {
  'N. Cyprus': 'CY',
  Kosovo: 'XK',
};
// Natural Earth abbreviates some names for map labels.
const NAME_OVERRIDES = {
  'United States of America': 'United States',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  Macedonia: 'North Macedonia',
  'S. Sudan': 'South Sudan',
};

function nearAnyBox(arcIndexes, decoded, boxes) {
  for (const index of arcIndexes) {
    for (const p of decoded[index < 0 ? ~index : index]) {
      for (const box of boxes) {
        if (p.lon >= box.west && p.lon <= box.east && p.lat >= box.south && p.lat <= box.north) return true;
      }
    }
  }
  return false;
}

/** Builds the generated document from the source TopoJSON. Deterministic. */
export function buildFirmsRegionBorders(topology, unToIso2) {
  const decoded = decodeArcs(topology);
  const boxes = monitoredRegionBoxes().map((box) => ({
    west: box.west - MARGIN_DEG,
    east: box.east + MARGIN_DEG,
    south: box.south - MARGIN_DEG,
    north: box.north + MARGIN_DEG,
  }));

  const names = {};
  const polygonsByCode = {};
  const fallbackNames = {};
  for (const geometry of topology.objects.countries.geometries) {
    const sourceName = geometry.properties?.name ?? '';
    const directCode = geometry.id != null ? unToIso2[geometry.id] : undefined;
    const featureCode = directCode ?? FEATURES_WITHOUT_NUMERIC_ID[sourceName];
    for (const polygon of geometryPolygons(geometry)) {
      if (!nearAnyBox(polygon.flat(), decoded, boxes)) continue;
      if (!featureCode) throw new Error(`No ISO2 code for Natural Earth feature "${sourceName}" (${geometry.id ?? 'no id'})`);
      const code = geometry.id === RUSSIA_NUMERIC_ID && insideBox(polygonBox(polygon, decoded), CRIMEA_BOX)
        ? 'UA'
        : featureCode;
      (polygonsByCode[code] ??= []).push(polygon);
      const name = NAME_OVERRIDES[sourceName] ?? sourceName;
      if (directCode === code) names[code] = name;
      else fallbackNames[code] ??= name;
    }
  }
  for (const code of Object.keys(polygonsByCode)) names[code] ??= fallbackNames[code];
  for (const [region, codes] of Object.entries(MONITORED_REGION_COUNTRIES)) {
    for (const code of codes) {
      if (!polygonsByCode[code]) throw new Error(`No border polygons for ${code}, a country of monitored region ${region}`);
    }
  }

  // A land border (an arc two polygons share) keeps the fine tolerance so the
  // two neighbours keep exactly the same simplified line; a coastline is coarser.
  const arcUses = new Map();
  for (const geometry of topology.objects.countries.geometries) {
    for (const index of geometryPolygons(geometry).flat(2)) {
      const source = index < 0 ? ~index : index;
      arcUses.set(source, (arcUses.get(source) ?? 0) + 1);
    }
  }
  const remap = new Map();
  const arcs = [];
  const useArc = (index) => {
    const source = index < 0 ? ~index : index;
    if (!remap.has(source)) {
      remap.set(source, arcs.length);
      const tolerance = (arcUses.get(source) ?? 0) > 1 ? SIMPLIFY_TOLERANCE_DEG : COAST_TOLERANCE_DEG;
      const encoded = [];
      let px = 0;
      let py = 0;
      for (const p of simplifyArc(decoded[source], tolerance)) {
        encoded.push(p.qx - px, p.qy - py);
        px = p.qx;
        py = p.qy;
      }
      arcs.push(encoded);
    }
    const target = remap.get(source);
    return index < 0 ? ~target : target;
  };
  const codes = Object.keys(polygonsByCode).sort();
  const countries = Object.fromEntries(codes.map((code) => [
    code,
    polygonsByCode[code].map((polygon) => polygon.map((ring) => ring.map(useArc))),
  ]));
  return {
    source: `${SOURCE_PATH} (Natural Earth 1:50m admin-0)`,
    generator: 'scripts/generate-firms-region-borders.mjs',
    marginDeg: MARGIN_DEG,
    toleranceDeg: SIMPLIFY_TOLERANCE_DEG,
    coastToleranceDeg: COAST_TOLERANCE_DEG,
    transform: topology.transform,
    names: Object.fromEntries(codes.map((code) => [code, names[code]])),
    countries,
    arcs,
  };
}

export function renderFirmsRegionBorders(document) {
  // One arc per line keeps diffs reviewable without inflating the file.
  const { arcs, ...head } = document;
  const headJson = JSON.stringify(head);
  return '// Generated by scripts/generate-firms-region-borders.mjs from public/data/countries-50m.json. Do not edit.\n'
    + `export default ${headJson.slice(0, -1)},"arcs":[\n${arcs.map((arc) => JSON.stringify(arc)).join(',\n')}\n]};\n`;
}

export function generateFirmsRegionBorders({ check = false } = {}) {
  const topology = JSON.parse(readFileSync(resolve(ROOT, SOURCE_PATH), 'utf8'));
  const unToIso2 = JSON.parse(readFileSync(resolve(ROOT, UN_TO_ISO2_PATH), 'utf8'));
  const expected = renderFirmsRegionBorders(buildFirmsRegionBorders(topology, unToIso2));
  const outputPath = resolve(ROOT, FIRMS_REGION_BORDERS_PATH);
  let actual = null;
  try {
    actual = readFileSync(outputPath, 'utf8');
  } catch { /* missing output is stale */ }
  const stale = actual !== expected;
  if (stale && !check) writeFileSync(outputPath, expected);
  return { stale, bytes: Buffer.byteLength(expected) };
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const check = process.argv.includes('--check');
  const { stale, bytes } = generateFirmsRegionBorders({ check });
  if (check && stale) {
    console.error(`${FIRMS_REGION_BORDERS_PATH} is stale; run node scripts/generate-firms-region-borders.mjs`);
    process.exit(1);
  }
  console.log(`${FIRMS_REGION_BORDERS_PATH} ${check ? 'current' : 'written'} (${bytes} bytes)`);
}
