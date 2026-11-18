#!/usr/bin/env node
// Drug development pipeline seed.
//
// Sources (all public, no registration required):
//   - ClinicalTrials.gov API v2 — industry Phase 3 trials + primary completion dates
//   - openFDA drugsfda          — recent original NDA/BLA approvals (CDER only;
//                                  CBER vaccines / cell & gene therapies are not in Drugs@FDA)
//   - ChEMBL                    — molecule type (modality) + approval status
//
// OPENFDA_API_KEY is optional: without it openFDA allows 1,000 requests/day per
// IP, and this seed makes a handful per run.
//
// ClinicalTrials.gov is the only hard dependency. ChEMBL failure degrades
// modality to name heuristics; openFDA failure publishes an empty approvals list.

import { loadEnvFile, CHROME_UA, runSeed } from './_seed-utils.mjs';
import { buildApproval, buildChemblIndex, buildPipelineEntry } from './_drug-pipeline-helpers.mjs';

loadEnvFile(import.meta.url);

const KEY = 'pharma:drug-pipeline:v1';
const TTL = 259200; // 72h — 3× a daily cron interval

const LOOKBACK_MONTHS = 12;   // primary completion already reached, decision still ahead
const LOOKAHEAD_MONTHS = 30;
const APPROVAL_LOOKBACK_DAYS = 180;
const MAX_ENTRIES = 1500; // keeps the Redis payload under ~1 MB
const EXPANSION_SHARE = 0.2;
const CT_PAGE_SIZE = 1000;
const CT_MAX_PAGES = 12;
const CHEMBL_PAGE_SIZE = 1000;
const CHEMBL_MAX_PAGES = 12;
const FDA_PAGE_SIZE = 1000;
const FDA_MAX_PAGES = 5;

const CT_FIELDS = [
  'NCTId', 'BriefTitle', 'OverallStatus', 'Phase', 'Condition', 'InterventionName',
  'InterventionType', 'LeadSponsorName', 'PrimaryCompletionDate', 'PrimaryCompletionDateType',
  'EnrollmentCount', 'ConditionMeshTerm', 'ConditionAncestorTerm',
].join(',');

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

function shiftMonths(d, months) {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

async function getJson(url, timeoutMs, label) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': CHROME_UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) throw new Error(`${label} HTTP ${resp.status}`);
  return resp.json();
}

async function fetchTrials(now) {
  const from = isoDay(shiftMonths(now, -LOOKBACK_MONTHS));
  const to = isoDay(shiftMonths(now, LOOKAHEAD_MONTHS));
  const advanced = [
    'AREA[Phase]PHASE3',
    'AREA[StudyType]INTERVENTIONAL',
    'AREA[LeadSponsorClass]INDUSTRY',
    'AREA[InterventionType](DRUG OR BIOLOGICAL OR GENETIC OR COMBINATION_PRODUCT)',
    `AREA[PrimaryCompletionDate]RANGE[${from},${to}]`,
  ].join(' AND ');
  const params = new URLSearchParams({
    'filter.overallStatus': 'RECRUITING,ACTIVE_NOT_RECRUITING,ENROLLING_BY_INVITATION,NOT_YET_RECRUITING,COMPLETED',
    'filter.advanced': advanced,
    pageSize: String(CT_PAGE_SIZE),
    fields: CT_FIELDS,
  });

  const studies = [];
  let pageToken = '';
  for (let page = 0; page < CT_MAX_PAGES; page++) {
    if (pageToken) params.set('pageToken', pageToken);
    const data = await getJson(`https://clinicaltrials.gov/api/v2/studies?${params}`, 60_000, 'ClinicalTrials.gov');
    studies.push(...(data.studies || []));
    pageToken = data.nextPageToken || '';
    if (!pageToken) break;
  }
  if (pageToken) console.warn(`  ClinicalTrials.gov: stopped at ${CT_MAX_PAGES} pages with more available`);
  console.log(`  ClinicalTrials.gov: ${studies.length} studies (${from} → ${to})`);
  return studies;
}

async function fetchChemblMolecules() {
  const molecules = [];
  for (let page = 0; page < CHEMBL_MAX_PAGES; page++) {
    const params = new URLSearchParams({
      max_phase__gte: '3',
      limit: String(CHEMBL_PAGE_SIZE),
      offset: String(page * CHEMBL_PAGE_SIZE),
      only: 'pref_name,molecule_type,max_phase,first_approval,molecule_synonyms',
    });
    const data = await getJson(`https://www.ebi.ac.uk/chembl/api/data/molecule.json?${params}`, 90_000, 'ChEMBL');
    molecules.push(...(data.molecules || []));
    if (!data.page_meta?.next) break;
  }
  console.log(`  ChEMBL: ${molecules.length} phase 3+ molecules`);
  return molecules;
}

async function fetchApprovals(now, chemblIndex) {
  const toDate = isoDay(now);
  const fromDate = isoDay(new Date(now.getTime() - APPROVAL_LOOKBACK_DAYS * 86_400_000));
  const range = `[${fromDate.replaceAll('-', '')}+TO+${toDate.replaceAll('-', '')}]`;
  const keyParam = process.env.OPENFDA_API_KEY ? `&api_key=${encodeURIComponent(process.env.OPENFDA_API_KEY)}` : '';
  // The date filter matches ANY submission (incl. supplements), so originals are
  // re-checked per record in buildApproval.
  const base = `https://api.fda.gov/drug/drugsfda.json?search=submissions.submission_status_date:${range}${keyParam}`;

  const approvals = [];
  let scanned = 0;
  for (let page = 0; page < FDA_MAX_PAGES; page++) {
    const data = await getJson(`${base}&limit=${FDA_PAGE_SIZE}&skip=${page * FDA_PAGE_SIZE}`, 60_000, 'openFDA');
    const results = data.results || [];
    scanned += results.length;
    for (const r of results) {
      const approval = buildApproval(r, fromDate, toDate, chemblIndex);
      if (approval) approvals.push(approval);
    }
    if (scanned >= (data.meta?.results?.total ?? 0) || results.length < FDA_PAGE_SIZE) break;
  }
  approvals.sort((a, b) => b.approvalDate.localeCompare(a.approvalDate));
  console.log(`  openFDA: ${approvals.length} original NDA/BLA approvals (from ${scanned} applications with activity)`);
  return approvals;
}

async function fetchAll() {
  const now = new Date();

  let chemblIndex = new Map();
  let chemblUnavailable = false;
  try {
    chemblIndex = buildChemblIndex(await fetchChemblMolecules());
  } catch (err) {
    chemblUnavailable = true;
    console.warn(`  ChEMBL unavailable — modality falls back to name heuristics: ${err.message}`);
  }

  const studies = await fetchTrials(now);
  const currentMonth = isoDay(now).slice(0, 7);
  const entries = studies
    .map((s) => buildPipelineEntry(s, chemblIndex))
    .filter(Boolean)
    // Drop trials whose whole estimated window is already behind us.
    .filter((e) => e.expectedDecisionTo >= currentMonth)
    .sort((a, b) => a.expectedDecisionFrom.localeCompare(b.expectedDecisionFrom)
      || Number(b.novel) - Number(a.novel)
      || b.enrollment - a.enrollment);

  let trimmed = entries;
  if (entries.length > MAX_ENTRIES) {
    // Entries are already soonest-first. Reserve a fifth of the cap for label
    // expansions of approved drugs so new-drug trials cannot crowd them out.
    const novel = entries.filter((e) => e.novel);
    const rest = entries.filter((e) => !e.novel);
    const restCap = Math.min(rest.length, Math.floor(MAX_ENTRIES * EXPANSION_SHARE));
    const novelCap = Math.min(novel.length, MAX_ENTRIES - restCap);
    trimmed = [...novel.slice(0, novelCap), ...rest.slice(0, MAX_ENTRIES - novelCap)]
      .sort((x, y) => x.expectedDecisionFrom.localeCompare(y.expectedDecisionFrom));
    console.warn(`  Trimmed ${entries.length} → ${trimmed.length} entries (cap ${MAX_ENTRIES})`);
  }

  let approvals = [];
  let approvalsUnavailable = false;
  try {
    approvals = await fetchApprovals(now, chemblIndex);
  } catch (err) {
    approvalsUnavailable = true;
    console.warn(`  openFDA unavailable — publishing without approvals: ${err.message}`);
  }

  console.log(`  Pipeline entries: ${trimmed.length} published of ${entries.length} (${entries.filter((e) => e.novel).length} novel before cap)`);
  return {
    entries: trimmed,
    approvals,
    generatedAt: now.toISOString(),
    chemblUnavailable,
    approvalsUnavailable,
  };
}

function validate(data) {
  // A healthy run yields well over a thousand trials; <50 means the registry
  // query or the entry builder broke.
  return Array.isArray(data?.entries) && data.entries.length >= 50;
}

export function declareRecords(data) {
  return Array.isArray(data?.entries) ? data.entries.length : 0;
}

if (process.argv[1]?.endsWith('seed-drug-pipeline.mjs')) {
  runSeed('pharma', 'drug-pipeline', KEY, fetchAll, {
    validateFn: validate,
    ttlSeconds: TTL,
    lockTtlMs: 600_000,
    sourceVersion: 'ctgov-v2+openfda-drugsfda+chembl',
    declareRecords,
    schemaVersion: 1,
    maxStaleMin: 2880,
  }).catch((err) => { console.error('FATAL:', err.message || err); process.exit(1); });
}

export { fetchAll };
