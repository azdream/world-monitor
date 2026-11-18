// Behavioural tests for server/worldmonitor/pharma/v1 handlers.
//
// Pattern mirrors tests/list-disease-outbreaks-handler.test.mjs — stub Upstash
// REST at the globalThis.fetch boundary because ESM module exports are immutable.

import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

let listDrugPipeline;
const cacheStore = new Map();
const REDIS_KEY = 'pharma:drug-pipeline:v1';

const entry = (over) => ({
  nctId: 'NCT00000001', title: 'T', candidate: 'A166', interventions: ['A166'], sponsor: 'Acme',
  phase: 'PHASE3', status: 'RECRUITING', modality: 'adc', modalitySource: 'name',
  therapeuticArea: 'oncology', conditions: ['Breast Cancer'], primaryCompletionDate: '2026-11-30',
  primaryCompletionActual: false, expectedDecisionFrom: '2027-09', expectedDecisionTo: '2028-09',
  novel: true, enrollment: 365, parentCompany: '', hqCountry: '', ...over,
});

const SEED = {
  generatedAt: '2026-11-18T00:00:00.000Z',
  entries: [
    entry({ nctId: 'NCT00000001', parentCompany: 'Kelun Pharmaceutical', hqCountry: 'CN' }),
    entry({ nctId: 'NCT00000002', modality: 'small_molecule', therapeuticArea: 'obesity', novel: false, parentCompany: 'Novo Nordisk', hqCountry: 'DK' }),
    entry({ nctId: 'NCT00000003', modality: 'small_molecule', therapeuticArea: 'oncology' }),
  ],
  approvals: [{ applicationNumber: 'NDA220414', brandName: 'PIMJETMI', approvalDate: '2026-11-10', applicationType: 'NDA', newMolecularEntity: true, modality: 'small_molecule' }],
};

before(async () => {
  process.env.UPSTASH_REDIS_REST_URL = 'https://stub-upstash.test';
  process.env.UPSTASH_REDIS_REST_TOKEN = 'stub-token';
  process.env.VERCEL_ENV = 'production';

  mock.method(globalThis, 'fetch', async (url) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    const getMatch = urlStr.match(/\/get\/([^/?#]+)$/);
    if (!getMatch) throw new Error(`unexpected fetch in test: ${urlStr}`);
    const key = decodeURIComponent(getMatch[1]);
    const result = cacheStore.has(key) ? JSON.stringify(cacheStore.get(key)) : null;
    return new Response(JSON.stringify({ result }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  ({ listDrugPipeline } = await import('../server/worldmonitor/pharma/v1/list-drug-pipeline.ts'));
});

beforeEach(() => {
  cacheStore.clear();
});

const req = (over = {}) => ({ modality: '', therapeuticArea: '', novelOnly: false, company: '', limit: 0, ...over });

describe('listDrugPipeline', () => {
  it('reports unavailable (not an empty success) when the seed key is missing', async () => {
    const resp = await listDrugPipeline({}, req());
    assert.equal(resp.unavailable, true);
    assert.deepEqual(resp.entries, []);
  });

  it('returns every entry with a derived source URL when unfiltered', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req());
    assert.equal(resp.unavailable, false);
    assert.equal(resp.total, 3);
    assert.equal(resp.entries[0].sourceUrl, 'https://clinicaltrials.gov/study/NCT00000001');
    assert.equal(resp.generatedAt, SEED.generatedAt);
  });

  it('filters by modality and therapeutic area together', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req({ modality: 'small_molecule', therapeuticArea: 'oncology' }));
    assert.deepEqual(resp.entries.map((e) => e.nctId), ['NCT00000003']);
    assert.equal(resp.total, 1);
  });

  it('keeps facet counts independent of the modality/area filter', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req({ modality: 'adc' }));
    assert.deepEqual(resp.modalityCounts, [{ key: 'small_molecule', count: 2 }, { key: 'adc', count: 1 }]);
    assert.deepEqual(resp.areaCounts, [{ key: 'oncology', count: 2 }, { key: 'obesity', count: 1 }]);
  });

  it('applies novel_only to both entries and facets', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req({ novelOnly: true }));
    assert.equal(resp.total, 2);
    assert.deepEqual(resp.modalityCounts, [{ key: 'adc', count: 1 }, { key: 'small_molecule', count: 1 }]);
  });

  it('caps entries at the limit while total reports the full match count', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req({ limit: 2 }));
    assert.equal(resp.entries.length, 2);
    assert.equal(resp.total, 3);
  });

  it('clamps an oversized limit to 500', async () => {
    cacheStore.set(REDIS_KEY, { ...SEED, entries: Array.from({ length: 600 }, (_, i) => entry({ nctId: `NCT${i}` })) });
    const resp = await listDrugPipeline({}, req({ limit: 100000 }));
    assert.equal(resp.entries.length, 500);
    assert.equal(resp.total, 600);
  });

  it('returns no entries for an unknown modality rather than ignoring the filter', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req({ modality: 'nonsense' }));
    assert.equal(resp.total, 0);
    assert.equal(resp.unavailable, false);
  });
});

describe('listDrugPipeline companies', () => {
  it('filters by parent company, case-insensitively', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req({ company: 'novo nordisk' }));
    assert.deepEqual(resp.entries.map((e) => e.nctId), ['NCT00000002']);
    assert.equal(resp.entries[0].hqCountry, 'DK');
  });

  it('never matches unmapped sponsors, whatever the filter says', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    assert.equal((await listDrugPipeline({}, req({ company: 'Acme' }))).total, 0);
  });

  it('counts only mapped sponsors in the company facet', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req());
    assert.deepEqual(resp.companyCounts, [{ key: 'Kelun Pharmaceutical', count: 1 }, { key: 'Novo Nordisk', count: 1 }]);
  });

  it('caps the company facet at 40 entries', async () => {
    cacheStore.set(REDIS_KEY, { ...SEED, entries: Array.from({ length: 60 }, (_, i) => entry({ nctId: `NCT${i}`, parentCompany: `Co ${i}` })) });
    assert.equal((await listDrugPipeline({}, req())).companyCounts.length, 40);
  });

  it('tolerates seed payloads written before the roll-up existed', async () => {
    const legacy = SEED.entries.map(({ parentCompany: _p, hqCountry: _h, ...rest }) => rest);
    cacheStore.set(REDIS_KEY, { ...SEED, entries: legacy });
    const resp = await listDrugPipeline({}, req());
    assert.equal(resp.total, 3);
    assert.equal(resp.entries[0].parentCompany, '');
    assert.deepEqual(resp.companyCounts, []);
  });
});

describe('listDrugPipeline approvals', () => {
  it('returns seeded approvals alongside the trials', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req());
    assert.equal(resp.approvalsUnavailable, false);
    assert.equal(resp.approvals.length, 1);
    assert.equal(resp.approvals[0].brandName, 'PIMJETMI');
    assert.equal(resp.approvals[0].route, '');
  });

  it('does not filter approvals by the trial filters', async () => {
    cacheStore.set(REDIS_KEY, SEED);
    const resp = await listDrugPipeline({}, req({ modality: 'adc', novelOnly: true }));
    assert.equal(resp.approvals.length, 1);
  });

  it('flags approvals unavailable when the seed ran without openFDA, while trials still serve', async () => {
    cacheStore.set(REDIS_KEY, { ...SEED, approvals: [], approvalsUnavailable: true });
    const resp = await listDrugPipeline({}, req());
    assert.equal(resp.unavailable, false);
    assert.equal(resp.total, 3);
    assert.equal(resp.approvalsUnavailable, true);
    assert.deepEqual(resp.approvals, []);
  });

  it('flags approvals unavailable when the whole seed key is missing', async () => {
    const resp = await listDrugPipeline({}, req());
    assert.equal(resp.unavailable, true);
    assert.equal(resp.approvalsUnavailable, true);
  });
});
