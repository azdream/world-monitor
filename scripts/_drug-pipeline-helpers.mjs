import { resolveParentCompany } from './_pharma-companies.mjs';

// Pure helpers for seed-drug-pipeline.mjs — classification, name matching and
// the decision-window heuristic. No I/O here so tests can import it directly.

export const MODALITIES = [
  'small_molecule', 'antibody', 'adc', 'cell_therapy', 'gene_therapy',
  'rna', 'vaccine', 'peptide_protein', 'other',
];

// `metabolic` is what remains of the metabolic group once obesity and diabetes
// are split out; oncology is always one of its two sub-areas.
export const THERAPEUTIC_AREAS = [
  'oncology_solid', 'oncology_hematologic', 'obesity', 'diabetes', 'metabolic',
  'neurology', 'cardiovascular', 'immunology', 'infectious', 'respiratory',
  'psychiatry', 'hematology', 'ophthalmology', 'other',
];

// Decision-window heuristic (months after primary completion):
//   earliest = fast filing (4) + priority review (6)
//   latest   = slow filing (10) + standard review incl. 60-day filing period (12)
// This is an estimate, never a regulator- or sponsor-announced date.
export const DECISION_LAG_MIN_MONTHS = 10;
export const DECISION_LAG_MAX_MONTHS = 22;

const PLACEBO_RE = /\b(placebo|sham|vehicle|saline|no (treatment|intervention)|observation|dummy)\b/i;
// Interventions that are background regimens rather than a named product.
const GENERIC_REGIMEN_RE = /\b(standard[- ]of[- ]care|standard (treatment|therapy|care)|best supportive care|chemotherap(y|ies)|radiotherapy|radiation|usual care|physician'?s choice|investigator'?s choice|surgery|soc)\b/i;

const FORM_WORDS = new Set([
  'HYDROCHLORIDE', 'HCL', 'SODIUM', 'POTASSIUM', 'CALCIUM', 'MESYLATE', 'MALEATE', 'TARTRATE',
  'SULFATE', 'SULPHATE', 'PHOSPHATE', 'ACETATE', 'CITRATE', 'FUMARATE', 'SUCCINATE', 'TOSYLATE',
  'BESYLATE', 'BROMIDE', 'CHLORIDE', 'DIHYDRATE', 'MONOHYDRATE', 'HEMIHYDRATE',
  'CAPSULE', 'CAPSULES', 'TABLET', 'TABLETS', 'INJECTION', 'INJECTIONS', 'INFUSION', 'SOLUTION',
  'SUSPENSION', 'CREAM', 'GEL', 'OINTMENT', 'PATCH', 'SPRAY', 'INHALER', 'ORAL', 'IV',
  'INTRAVENOUS', 'SUBCUTANEOUS', 'SC', 'TOPICAL', 'FOR', 'DOSE', 'LOW', 'HIGH', 'MG', 'ML',
  'EXTENDED', 'RELEASE', 'ER', 'XR', 'PREFILLED', 'SYRINGE', 'PEN',
]);

export function isPlacebo(name) {
  return PLACEBO_RE.test(String(name || ''));
}

export function isGenericRegimen(name) {
  return GENERIC_REGIMEN_RE.test(String(name || ''));
}

/** Uppercase, drop parentheticals / dosages / punctuation. */
export function normalizeDrugName(name) {
  return String(name || '')
    .toUpperCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(\.\d+)?\s*(MG|MCG|UG|G|ML|IU|%)(\/\w+)?\b/g, ' ')
    .replace(/[^A-Z0-9\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Candidate lookup keys for a free-text intervention name, most specific first. */
export function drugNameKeys(name) {
  const norm = normalizeDrugName(name);
  if (!norm) return [];
  const keys = [norm];
  const stripped = norm.split(' ').filter((w) => !FORM_WORDS.has(w) && !/^\d+$/.test(w)).join(' ');
  if (stripped && stripped !== norm) keys.push(stripped);
  // Biologic 4-letter suffix (e.g. "RANIBIZUMAB-BLRZ") → core name.
  const core = (stripped || norm).replace(/-[A-Z]{4}$/, '');
  if (core && !keys.includes(core)) keys.push(core);
  // Free-text names ("Anlotinib hydrochloride capsule", "CU-20101 treatment for ...")
  // usually carry the product as one token.
  for (const word of (stripped || norm).split(' ')) {
    if (word.length >= 5 && !keys.includes(word)) keys.push(word);
  }
  return keys;
}

const ADC_RE = /\b\w+mab\s+\w*(vedotin|tecan|dotin|tansine|ozogamicin|tesirine)\b|antibody[- ]drug conjugate|\badc\b/i;
const VACCINE_RE = /vaccin/i;
const CELL_RE = /\b(car[- ]?t|car[- ]?nk|t[- ]cells?|nk cells?|stem cells?|cell therapy|tumou?r[- ]infiltrating lymphocytes?)\b|\b\w+(leu)?cel\b/i;
const GENE_RE = /gene therapy|\baav\w*|lentivir|\b\w+gene\b|\b\w+vec\b/i;
const RNA_RE = /\b\w+(siran|rsen)\b|\bmrna\b|\bsirna\b|antisense|oligonucleotide/i;
const ANTIBODY_RE = /\b\w+mab\b|antibod/i;
const PROTEIN_RE = /\b\w{4,}tide\b|\b\w+cept\b|\b\w+ (alfa|beta)\b|insulin|interferon|globulin|peptide|\bfusion protein\b/i;

/** Modality from the product name alone; '' when the name gives no signal. */
export function modalityFromName(name) {
  const s = String(name || '');
  if (!s) return '';
  if (VACCINE_RE.test(s)) return 'vaccine';
  if (ADC_RE.test(s)) return 'adc';
  if (RNA_RE.test(s)) return 'rna';
  // Cell before gene: CAR-T INNs carry both stems ("axicabtagene ciloleucel").
  if (CELL_RE.test(s)) return 'cell_therapy';
  if (GENE_RE.test(s)) return 'gene_therapy';
  if (ANTIBODY_RE.test(s)) return 'antibody';
  if (PROTEIN_RE.test(s)) return 'peptide_protein';
  return '';
}

/** Map a ChEMBL molecule_type to our modality vocabulary; '' when unknown. */
export function modalityFromChemblType(moleculeType, name = '') {
  const t = String(moleculeType || '').toLowerCase();
  if (!t || t === 'unknown') return '';
  if (t.includes('conjugate')) return 'adc';
  if (t === 'small molecule') return 'small_molecule';
  if (t === 'antibody') return ADC_RE.test(name) ? 'adc' : 'antibody';
  if (t === 'protein' || t === 'enzyme') return 'peptide_protein';
  if (t === 'oligonucleotide') return 'rna';
  if (t === 'cell') return 'cell_therapy';
  if (t === 'gene') return 'gene_therapy';
  return 'other';
}

/**
 * Resolve modality with provenance.
 * @param {string} name intervention / ingredient name
 * @param {string} interventionType ClinicalTrials.gov type (DRUG | BIOLOGICAL | GENETIC | ...)
 * @param {{type?: string}|null} chemblHit
 */
export function resolveModality(name, interventionType, chemblHit) {
  const fromChembl = chemblHit ? modalityFromChemblType(chemblHit.type, name) : '';
  if (fromChembl) return { modality: fromChembl, source: 'chembl' };
  const fromName = modalityFromName(name);
  if (fromName) return { modality: fromName, source: 'name' };
  const type = String(interventionType || '').toUpperCase();
  if (type === 'GENETIC') return { modality: 'gene_therapy', source: 'intervention_type' };
  if (type === 'DRUG') return { modality: 'small_molecule', source: 'intervention_type' };
  return { modality: 'other', source: 'intervention_type' };
}

// Order matters: first match wins (e.g. lung cancer is oncology, not respiratory;
// HIV is infectious, not immunology; asthma is respiratory, not immunology;
// diabetic macular edema is ophthalmology, not metabolic). Registries are full
// of bare abbreviations ("NSCLC", "T2DM"), so the text patterns carry them.
const AREA_RULES = [
  ['oncology', /neoplasms?/i, /cancer|carcinoma|tumou?r|lymphoma|leuk(a)?emia|myeloma|melanoma|sarcoma|glioma|glioblastoma|malignan|\b(nsclc|sclc|cll|sll|aml|hcc|mds)\b/i],
  ['infectious', /^infections?$|virus diseases|bacterial infections|communicable diseases|mycoses|parasitic diseases/i, /\bhiv\b|hepatitis|covid|sars-cov|influenza|infection|tubercul|malaria|pneumonia|sepsis|\brsv\b/i],
  ['ophthalmology', /^eye diseases$/i, /macular|retin(a|al|itis|opathy)|glaucoma|myopia|kerato|uveitis|dry eye|ocular|ophthalm|geographic atrophy|\bn?amd\b/i],
  ['hematology', /hematologic diseases|hemic and lymphatic diseases/i, /h(a)?emophilia|an(a)?emia|sickle cell|thalass(a)?emia|thrombocytopeni/i],
  ['metabolic', /nutritional and metabolic diseases|endocrine system diseases/i, /diabet|obes|overweight|weight (loss|management)|dyslipid|hypercholesterol|\bt[12]dm?\b|\bnash\b|\bmash\b|steatohepatitis/i],
  ['neurology', /nervous system diseases/i, /alzheimer|parkinson|epilep|migraine|multiple sclerosis|neuropath|\bals\b|amyotrophic|huntington|myasthenia|stroke/i],
  ['psychiatry', /mental disorders/i, /depress|schizo|bipolar|anxiety|\badhd\b|autism|substance use|insomnia/i],
  ['cardiovascular', /cardiovascular diseases/i, /heart|cardi|hypertension|atrial|coronary|atheroscl|thrombo/i],
  ['respiratory', /respiratory tract diseases/i, /asthma|\bcopd\b|pulmonary|cystic fibrosis|bronch/i],
  ['immunology', /immune system diseases|skin and connective tissue diseases/i, /arthritis|psoria|lupus|dermatitis|colitis|crohn|eczema|alopecia|hidradenitis|spondyl/i],
];

const HEME_MALIGNANCY_RE = /leuk(a)?emia|lymphoma|myeloma|myelodysplast|myeloproliferat|myelofibrosis|hematologic neoplasms|plasma cell|waldenstr|\b(cll|sll|aml|mds)\b/i;
const OBESITY_RE = /obes|overweight|weight (loss|management)|adipos/i;
const DIABETES_RE = /diabet|\bt[12]dm?\b|hyperglyc/i;

// "Non-diabetic chronic kidney disease" is not a diabetes trial.
function affirmed(condition) {
  return String(condition || '').replace(/\bnon[- ]?(diabetic|obese|cancerous|malignant|infectious)\b/gi, ' ');
}

function refineMetabolic(meshTerms, conditions) {
  // A trial can name both ("obesity with type 2 diabetes"): the first-listed
  // condition is the registrant's primary one, so it decides. MeSH terms are
  // the fallback; ancestors come last in that list and are too broad to help.
  for (const text of [...conditions, ...meshTerms]) {
    if (OBESITY_RE.test(text)) return 'obesity';
    if (DIABETES_RE.test(text)) return 'diabetes';
  }
  return 'metabolic';
}

/**
 * @param {string[]} meshTerms MeSH condition terms followed by their ancestors
 * @param {string[]} conditions free-text conditions as registered
 */
export function classifyTherapeuticArea(meshTerms = [], rawConditions = []) {
  const conditions = rawConditions.map(affirmed);
  const text = conditions.join(' | ');
  const byText = (value) => AREA_RULES.find(([, , textRe]) => textRe.test(value))?.[0];
  // 1. The first-listed condition is the registrant's primary one. MeSH terms
  //    are not tied to a condition, so a comorbidity listed second ("psoriatic
  //    arthritis" + "obesity") would otherwise decide the area.
  // 2. MeSH, for primaries the text patterns do not recognise.
  // 3. Any condition's text.
  const area = byText(conditions[0] ?? '')
    ?? AREA_RULES.find(([, meshRe]) => meshTerms.some((t) => meshRe.test(t)))?.[0]
    ?? byText(text)
    ?? 'other';
  if (area === 'oncology') {
    return meshTerms.some((t) => HEME_MALIGNANCY_RE.test(t)) || HEME_MALIGNANCY_RE.test(text)
      ? 'oncology_hematologic'
      : 'oncology_solid';
  }
  if (area === 'metabolic') return refineMetabolic(meshTerms, conditions);
  return area;
}

/** Add months to "YYYY-MM" or "YYYY-MM-DD"; returns "YYYY-MM" or '' on bad input. */
export function addMonths(dateStr, months) {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ''));
  if (!m) return '';
  const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function estimateDecisionWindow(primaryCompletionDate) {
  return {
    from: addMonths(primaryCompletionDate, DECISION_LAG_MIN_MONTHS),
    to: addMonths(primaryCompletionDate, DECISION_LAG_MAX_MONTHS),
  };
}

/** Build an uppercase-name → {type, phase} index from ChEMBL molecule rows. */
export function buildChemblIndex(molecules) {
  const index = new Map();
  const put = (name, entry) => {
    const key = normalizeDrugName(name);
    if (!key || key.length < 3) return;
    const prev = index.get(key);
    // Prefer the most advanced molecule when two share a synonym.
    if (!prev || entry.phase > prev.phase) index.set(key, entry);
  };
  for (const mol of molecules || []) {
    const entry = {
      type: mol.molecule_type || '',
      phase: Number(mol.max_phase) || 0,
      firstApproval: Number(mol.first_approval) || 0,
    };
    put(mol.pref_name, entry);
    for (const syn of mol.molecule_synonyms || []) put(syn.molecule_synonym, entry);
  }
  return index;
}

export function lookupChembl(index, name) {
  if (!index || index.size === 0) return null;
  for (const key of drugNameKeys(name)) {
    const hit = index.get(key);
    if (hit) return hit;
  }
  return null;
}

const CANDIDATE_TYPES = new Set(['DRUG', 'BIOLOGICAL', 'GENETIC', 'COMBINATION_PRODUCT']);

/**
 * Convert one ClinicalTrials.gov v2 study into a pipeline entry, or null when
 * it has no usable drug candidate or primary completion date.
 */
export function buildPipelineEntry(study, chemblIndex) {
  const p = study?.protocolSection || {};
  const nctId = p.identificationModule?.nctId || '';
  const pcd = p.statusModule?.primaryCompletionDateStruct || {};
  if (!nctId || !/^\d{4}-\d{2}/.test(pcd.date || '')) return null;

  const all = (p.armsInterventionsModule?.interventions || [])
    .filter((i) => i?.name && CANDIDATE_TYPES.has(String(i.type || '').toUpperCase()))
    .filter((i) => !isPlacebo(i.name));
  const named = all.filter((i) => !isGenericRegimen(i.name));
  if (named.length === 0) return null;

  const scored = named.map((i) => ({ ...i, hit: lookupChembl(chemblIndex, i.name) }));
  const unapproved = scored.find((i) => !i.hit || i.hit.phase < 4);
  const lead = unapproved || scored[0];
  const { modality, source } = resolveModality(lead.name, lead.type, lead.hit);

  const derived = study?.derivedSection?.conditionBrowseModule || {};
  const meshTerms = [...(derived.meshes || []), ...(derived.ancestors || [])].map((m) => m.term).filter(Boolean);
  const conditions = (p.conditionsModule?.conditions || []).filter(Boolean);
  const window = estimateDecisionWindow(pcd.date);
  const phases = p.designModule?.phases || [];
  const sponsor = String(p.sponsorCollaboratorsModule?.leadSponsor?.name || '').slice(0, 80);
  const parent = resolveParentCompany(sponsor);

  return {
    nctId,
    title: String(p.identificationModule?.briefTitle || '').slice(0, 160),
    candidate: String(lead.name).slice(0, 80),
    interventions: [...new Set(named.map((i) => String(i.name).slice(0, 60)))].slice(0, 4),
    sponsor,
    // Omitted when the roll-up table has no entry (readers default to ''):
    // most sponsors are unmapped, and the payload is held near 1 MB.
    ...(parent ? { parentCompany: parent.name, hqCountry: parent.hq } : {}),
    phase: phases.includes('PHASE2') ? 'PHASE2_PHASE3' : 'PHASE3',
    status: p.statusModule?.overallStatus || '',
    modality,
    modalitySource: source,
    therapeuticArea: classifyTherapeuticArea(meshTerms, conditions),
    conditions: conditions.slice(0, 3).map((c) => String(c).slice(0, 80)),
    primaryCompletionDate: pcd.date,
    primaryCompletionActual: pcd.type === 'ACTUAL',
    expectedDecisionFrom: window.from,
    expectedDecisionTo: window.to,
    novel: Boolean(unapproved),
    enrollment: Number(p.designModule?.enrollmentInfo?.count) || 0,
  };
}

function fdaDate(yyyymmdd) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(yyyymmdd || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * Convert one openFDA drugsfda result into an approval record when its
 * ORIGINAL submission was approved inside [fromDate, toDate] (YYYY-MM-DD).
 * Supplements, generics (ANDA) and out-of-window originals return null.
 */
export function buildApproval(result, fromDate, toDate, chemblIndex) {
  const appNo = String(result?.application_number || '');
  const type = appNo.startsWith('NDA') ? 'NDA' : appNo.startsWith('BLA') ? 'BLA' : '';
  if (!type) return null;
  const orig = (result.submissions || []).find((s) => s.submission_type === 'ORIG' && s.submission_status === 'AP');
  const approvalDate = fdaDate(orig?.submission_status_date);
  if (!approvalDate || approvalDate < fromDate || approvalDate > toDate) return null;

  const product = (result.products || [])[0] || {};
  const approvalParent = resolveParentCompany(result.sponsor_name);
  const generic = result.openfda?.generic_name?.[0]
    || (product.active_ingredients || []).map((a) => a.name).filter(Boolean).join(' / ')
    || '';
  const brand = result.openfda?.brand_name?.[0] || product.brand_name || '';
  const hit = lookupChembl(chemblIndex, generic);
  const resolved = resolveModality(generic, type === 'NDA' ? 'DRUG' : 'BIOLOGICAL', hit);
  // An unrecognised BLA is still a biologic, never a small molecule.
  const modality = type === 'BLA' && resolved.modality === 'small_molecule' ? 'peptide_protein' : resolved.modality;

  return {
    applicationNumber: appNo,
    brandName: String(brand).slice(0, 80),
    genericName: String(generic).slice(0, 120),
    sponsor: String(result.sponsor_name || '').slice(0, 80),
    ...(approvalParent ? { parentCompany: approvalParent.name } : {}),
    approvalDate,
    applicationType: type,
    reviewPriority: String(orig.review_priority || '').toUpperCase(),
    newMolecularEntity: type === 'NDA'
      ? /^TYPE 1\b/i.test(String(orig.submission_class_code || ''))
      // BLAs carry no chemical-type code. Treat as new unless the ingredient was
      // already approved in an earlier year (biosimilars, new presentations).
      : !(hit && hit.firstApproval > 0 && hit.firstApproval < Number(approvalDate.slice(0, 4))),
    modality,
    route: String(result.openfda?.route?.[0] || product.route || '').slice(0, 40),
  };
}

export function countBy(entries, field) {
  const counts = new Map();
  for (const e of entries) counts.set(e[field], (counts.get(e[field]) || 0) + 1);
  return [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}
