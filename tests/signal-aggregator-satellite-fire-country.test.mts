import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const originalFetch = globalThis.fetch;
const bundledCountries = readFileSync(new URL('../public/data/countries.geojson', import.meta.url), 'utf8');

function json(body: string): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
}

describe('signalAggregator satellite fire country (2026-11-19 audit)', () => {
  let signalAggregator: typeof import('@/services/signal-aggregator')['signalAggregator'];

  before(async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('countries.geojson')) return json(bundledCountries);
      if (url.includes('country-boundary-overrides')) return json('{"type":"FeatureCollection","features":[]}');
      throw new Error(`unexpected fetch ${url}`);
    }) as typeof fetch;
    const geometry = await import('@/services/country-geometry');
    await geometry.preloadCountryGeometry();
    ({ signalAggregator } = await import('@/services/signal-aggregator'));
  });

  after(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => signalAggregator.clear());

  function fireSignal(fire: { lat: number; lon: number; region: string }) {
    signalAggregator.ingestSatelliteFires([{ ...fire, brightness: 340, frp: 12, acq_date: new Date().toISOString() }]);
    const signals = signalAggregator.getCountryClusters().flatMap((cluster) => cluster.signals);
    assert.equal(signals.length, 1);
    return signals[0]!;
  }

  it('names a Basra fire after Iraq even when its region label says Iran', () => {
    const signal = fireSignal({ lat: 30.5, lon: 47.8, region: 'Iran' });
    assert.equal(signal.country, 'IQ');
    assert.equal(signal.countryName, 'Iraq');
  });

  it('falls back to the region label only when the point is in no country', () => {
    const signal = fireSignal({ lat: 26.6, lon: 52.3, region: 'Iran' });
    assert.equal(signal.country, 'IR');
    assert.equal(signal.countryName, 'Iran');
  });
});
