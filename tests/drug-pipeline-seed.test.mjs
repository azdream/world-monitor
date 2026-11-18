// Unit coverage for scripts/_drug-pipeline-helpers.mjs — the pure
// classification / matching / estimation logic behind seed-drug-pipeline.mjs.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonths,
  buildApproval,
  buildChemblIndex,
  buildPipelineEntry,
  classifyTherapeuticArea,
  drugNameKeys,
  estimateDecisionWindow,
  lookupChembl,
  modalityFromName,
  resolveModality,
} from '../scripts/_drug-pipeline-helpers.mjs';
import { PHARMA_PARENTS, normalizeCompanyName, resolveParentCompany } from '../scripts/_pharma-companies.mjs';

const chembl = buildChemblIndex([
  { pref_name: 'BEVACIZUMAB', molecule_type: 'Antibody', max_phase: '4.0', first_approval: 2004, molecule_synonyms: [{ molecule_synonym: 'Avastin' }] },
  { pref_name: 'ANLOTINIB', molecule_type: 'Small molecule', max_phase: '3.0', first_approval: null, molecule_synonyms: [] },
  { pref_name: 'RANIBIZUMAB', molecule_type: 'Antibody', max_phase: '4.0', first_approval: 2006, molecule_synonyms: [] },
  { pref_name: 'GEFURULIMAB', molecule_type: 'Antibody', max_phase: '3.0', first_approval: null, molecule_synonyms: [] },
]);

function study({ nctId = 'NCT00000001', pcd = '2026-06-30', pcdType = 'ESTIMATED', interventions, conditions = ['Metastatic Colorectal Cancer'], meshes = ['Neoplasms'], phases = ['PHASE3'] }) {
  return {
    protocolSection: {
      identificationModule: { nctId, briefTitle: 'A Study' },
      statusModule: { overallStatus: 'RECRUITING', primaryCompletionDateStruct: { date: pcd, type: pcdType } },
      sponsorCollaboratorsModule: { leadSponsor: { name: 'Acme Pharma' } },
      conditionsModule: { conditions },
      designModule: { phases, enrollmentInfo: { count: 500 } },
      armsInterventionsModule: { interventions },
    },
    derivedSection: { conditionBrowseModule: { ancestors: meshes.map((term) => ({ term })) } },
  };
}

describe('decision window heuristic', () => {
  it('adds months across year boundaries', () => {
    assert.equal(addMonths('2026-11-30', 10), '2027-09');
    assert.equal(addMonths('2026-03', 22), '2028-01');
    assert.equal(addMonths('2026-12', 0), '2026-12');
  });

  it('returns empty for unusable dates instead of guessing', () => {
    assert.equal(addMonths('', 10), '');
    assert.equal(addMonths('2026', 10), '');
  });

  it('spans primary completion +10 to +22 months', () => {
    assert.deepEqual(estimateDecisionWindow('2026-01-15'), { from: '2026-11', to: '2027-11' });
  });
});

describe('modality classification', () => {
  it('reads modality from INN stems and descriptors', () => {
    assert.equal(modalityFromName('Trastuzumab deruxtecan'), 'adc');
    assert.equal(modalityFromName('Amlitelimab'), 'antibody');
    assert.equal(modalityFromName('Inclisiran'), 'rna');
    assert.equal(modalityFromName('Axicabtagene ciloleucel'), 'cell_therapy');
    assert.equal(modalityFromName('Valoctocogene roxaparvovec'), 'gene_therapy');
    assert.equal(modalityFromName('bivalent enterovirus vaccine (Vero cell), inactivated'), 'vaccine');
    assert.equal(modalityFromName('Cagrilintide'), 'peptide_protein');
    assert.equal(modalityFromName('VCT220'), '');
  });

  it('prefers ChEMBL, then the name, then the registry intervention type', () => {
    assert.deepEqual(resolveModality('Anlotinib', 'DRUG', { type: 'Small molecule' }), { modality: 'small_molecule', source: 'chembl' });
    assert.deepEqual(resolveModality('Amlitelimab', 'DRUG', null), { modality: 'antibody', source: 'name' });
    assert.deepEqual(resolveModality('VCT220', 'DRUG', null), { modality: 'small_molecule', source: 'intervention_type' });
    assert.deepEqual(resolveModality('XYZ-101', 'GENETIC', null), { modality: 'gene_therapy', source: 'intervention_type' });
    assert.deepEqual(resolveModality('XYZ-101', 'BIOLOGICAL', null), { modality: 'other', source: 'intervention_type' });
  });

  it('upgrades a ChEMBL antibody to ADC when the payload stem is present', () => {
    assert.equal(resolveModality('Sacituzumab govitecan', 'BIOLOGICAL', { type: 'Antibody' }).modality, 'adc');
  });

  it('falls through when ChEMBL has the molecule but not its type', () => {
    assert.deepEqual(resolveModality('Amlitelimab', 'BIOLOGICAL', { type: 'Unknown' }), { modality: 'antibody', source: 'name' });
  });
});

describe('therapeutic area classification', () => {
  it('resolves overlapping MeSH ancestors by priority', () => {
    assert.equal(classifyTherapeuticArea(['Respiratory Tract Diseases', 'Neoplasms'], []), 'oncology_solid');
    assert.equal(classifyTherapeuticArea(['Immune System Diseases', 'Virus Diseases'], []), 'infectious');
    assert.equal(classifyTherapeuticArea(['Immune System Diseases', 'Respiratory Tract Diseases'], []), 'respiratory');
    assert.equal(classifyTherapeuticArea(['Mental Disorders', 'Nervous System Diseases'], []), 'neurology');
  });

  it('splits oncology into solid tumours and blood cancers', () => {
    assert.equal(classifyTherapeuticArea(['Colorectal Neoplasms', 'Neoplasms'], ['Metastatic Colorectal Cancer']), 'oncology_solid');
    assert.equal(classifyTherapeuticArea(['Lymphoma, Large B-Cell, Diffuse', 'Neoplasms'], ['DLBCL']), 'oncology_hematologic');
    assert.equal(classifyTherapeuticArea(['Multiple Myeloma', 'Neoplasms'], []), 'oncology_hematologic');
    assert.equal(classifyTherapeuticArea(['Retinoblastoma', 'Neoplasms', 'Eye Diseases'], []), 'oncology_solid');
  });

  it('recognises bare registry abbreviations', () => {
    assert.equal(classifyTherapeuticArea([], ['NSCLC']), 'oncology_solid');
    assert.equal(classifyTherapeuticArea([], ['CLL/SLL']), 'oncology_hematologic');
    assert.equal(classifyTherapeuticArea([], ['T2DM']), 'diabetes');
  });

  it('splits obesity and diabetes out of metabolic by the first-listed condition', () => {
    assert.equal(classifyTherapeuticArea(['Diabetes Mellitus, Type 2', 'Endocrine System Diseases'], ['Obesity', 'Type 2 Diabetes']), 'obesity');
    assert.equal(classifyTherapeuticArea(['Obesity', 'Nutritional and Metabolic Diseases'], ['Type 2 Diabetes Mellitus', 'Obesity']), 'diabetes');
    assert.equal(classifyTherapeuticArea([], ['Weight Loss']), 'obesity');
    assert.equal(classifyTherapeuticArea(['Hypercholesterolemia', 'Nutritional and Metabolic Diseases'], ['HeFH']), 'metabolic');
  });

  it('lets the first-listed condition outrank a comorbidity\'s MeSH terms', () => {
    assert.equal(classifyTherapeuticArea(['Arthritis, Psoriatic', 'Obesity', 'Nutritional and Metabolic Diseases'], ['Psoriatic Arthritis', 'Obesity']), 'immunology');
    assert.equal(classifyTherapeuticArea(['Heart Failure', 'Obesity', 'Nutritional and Metabolic Diseases'], ['Heart Failure', 'Obesity']), 'cardiovascular');
  });

  it('does not read a negated condition as the condition', () => {
    assert.notEqual(classifyTherapeuticArea(['Renal Insufficiency, Chronic'], ['Non-diabetic Chronic Kidney Disease']), 'diabetes');
    assert.equal(classifyTherapeuticArea([], ['Non-Diabetic Chronic Kidney Disease']), 'other');
  });

  it('files eye disease under ophthalmology even when diabetes is the cause', () => {
    assert.equal(classifyTherapeuticArea(['Macular Edema', 'Eye Diseases', 'Diabetes Mellitus', 'Endocrine System Diseases'], ['Diabetic Macular Edema']), 'ophthalmology');
    assert.equal(classifyTherapeuticArea([], ['Neovascular Age-related Macular Degeneration']), 'ophthalmology');
  });

  it('falls back to other when nothing matches', () => {
    assert.equal(classifyTherapeuticArea([], ['Glabellar Frown Lines']), 'other');
    assert.equal(classifyTherapeuticArea(), 'other');
  });
});

describe('parent company roll-up', () => {
  it('maps subsidiaries and registry spellings to the parent', () => {
    assert.deepEqual(resolveParentCompany('Janssen Research & Development, LLC'), { name: 'Johnson & Johnson', hq: 'US' });
    assert.deepEqual(resolveParentCompany('Suzhou Suncadia Biopharmaceuticals Co., Ltd.'), { name: 'Jiangsu Hengrui', hq: 'CN' });
    assert.equal(resolveParentCompany('Seagen, a wholly owned subsidiary of Pfizer')?.name, 'Pfizer');
    assert.equal(resolveParentCompany('ALEXION PHARM')?.name, 'AstraZeneca');
    assert.equal(resolveParentCompany('Hoffmann-La Roche')?.name, 'Roche');
  });

  it('keeps the two unrelated Mercks apart and leaves bare "Merck" unmapped', () => {
    assert.equal(resolveParentCompany('Merck Sharp & Dohme LLC')?.hq, 'US');
    assert.equal(resolveParentCompany('EMD Serono Research & Development Institute, Inc.')?.hq, 'DE');
    assert.equal(resolveParentCompany('Merck KGaA, Darmstadt, Germany')?.hq, 'DE');
    assert.equal(resolveParentCompany('Merck'), null);
  });

  it('matches whole words only', () => {
    // "roche" inside La Roche-Posay (L'Oreal) and "ucb" inside a longer token must not match.
    assert.equal(resolveParentCompany('La Roche-Posay Laboratoire Dermatologique'), null);
    assert.equal(resolveParentCompany('Bayerische Forschungsstiftung'), null);
    assert.equal(resolveParentCompany('Lillydale Biotech'), null);
  });

  it('returns null rather than a guess for unknown or empty sponsors', () => {
    assert.equal(resolveParentCompany('Vanda Pharmaceuticals'), null);
    assert.equal(resolveParentCompany(''), null);
    assert.equal(resolveParentCompany(null), null);
  });

  it('has no alias claimed by two parents and only ISO-2 headquarters', () => {
    const seen = new Map();
    for (const parent of PHARMA_PARENTS) {
      assert.match(parent.hq, /^[A-Z]{2}$/, `${parent.name} hq`);
      for (const alias of parent.aliases) {
        const key = normalizeCompanyName(alias);
        assert.equal(key, alias, `${parent.name}: alias "${alias}" must already be normalized`);
        assert.ok(!seen.has(key), `alias "${alias}" claimed by ${seen.get(key)} and ${parent.name}`);
        seen.set(key, parent.name);
      }
    }
  });

  it('resolves every alias to its own parent (no alias is shadowed by a longer one elsewhere)', () => {
    for (const parent of PHARMA_PARENTS) {
      for (const alias of parent.aliases) {
        assert.equal(resolveParentCompany(alias)?.name, parent.name, `alias "${alias}"`);
      }
    }
  });
});

describe('ChEMBL name matching', () => {
  it('matches free-text registry names to the indexed molecule', () => {
    assert.equal(lookupChembl(chembl, 'Anlotinib hydrochloride capsule')?.phase, 3);
    assert.equal(lookupChembl(chembl, 'Avastin 10 mg/kg (IV)')?.phase, 4);
    assert.equal(lookupChembl(chembl, 'RANIBIZUMAB-BLRZ')?.firstApproval, 2006);
    assert.equal(lookupChembl(chembl, 'A166'), null);
  });

  it('never returns keys for an empty name', () => {
    assert.deepEqual(drugNameKeys(''), []);
    assert.deepEqual(drugNameKeys(null), []);
  });

  it('tolerates a missing index (ChEMBL outage)', () => {
    assert.equal(lookupChembl(new Map(), 'Bevacizumab'), null);
  });
});

describe('buildPipelineEntry', () => {
  it('leads with the unapproved intervention and marks the trial novel', () => {
    const entry = buildPipelineEntry(study({
      interventions: [
        { type: 'DRUG', name: 'Bevacizumab' },
        { type: 'DRUG', name: 'Anlotinib hydrochloride capsule' },
        { type: 'DRUG', name: 'Placebo' },
        { type: 'DRUG', name: 'Chemotherapy' },
      ],
    }), chembl);
    assert.equal(entry.candidate, 'Anlotinib hydrochloride capsule');
    assert.equal(entry.novel, true);
    assert.equal(entry.modality, 'small_molecule');
    assert.equal(entry.modalitySource, 'chembl');
    assert.equal(entry.therapeuticArea, 'oncology_solid');
    assert.equal('parentCompany' in entry, false, 'unmapped sponsors carry no roll-up fields');
    assert.equal('hqCountry' in entry, false);
    assert.deepEqual(entry.interventions, ['Bevacizumab', 'Anlotinib hydrochloride capsule']);
    assert.equal(entry.expectedDecisionFrom, '2027-04');
    assert.equal(entry.expectedDecisionTo, '2028-04');
    assert.equal(entry.primaryCompletionActual, false);
  });

  it('marks a trial of only approved drugs as a label expansion', () => {
    const entry = buildPipelineEntry(study({ interventions: [{ type: 'BIOLOGICAL', name: 'Bevacizumab' }] }), chembl);
    assert.equal(entry.novel, false);
    assert.equal(entry.modality, 'antibody');
  });

  it('attaches the parent company and headquarters when the sponsor is known', () => {
    const s = study({ interventions: [{ type: 'DRUG', name: 'A166' }] });
    s.protocolSection.sponsorCollaboratorsModule.leadSponsor.name = 'Sichuan Kelun-Biotech Biopharmaceutical Co., Ltd.';
    const entry = buildPipelineEntry(s, chembl);
    assert.equal(entry.sponsor, 'Sichuan Kelun-Biotech Biopharmaceutical Co., Ltd.');
    assert.equal(entry.parentCompany, 'Kelun Pharmaceutical');
    assert.equal(entry.hqCountry, 'CN');
  });

  it('labels combined phase 2/3 trials', () => {
    const entry = buildPipelineEntry(study({ phases: ['PHASE2', 'PHASE3'], interventions: [{ type: 'DRUG', name: 'A166' }] }), chembl);
    assert.equal(entry.phase, 'PHASE2_PHASE3');
  });

  it('skips trials with no named drug or no usable completion date', () => {
    assert.equal(buildPipelineEntry(study({ interventions: [{ type: 'DRUG', name: 'Placebo' }, { type: 'DRUG', name: 'Standard of care' }] }), chembl), null);
    assert.equal(buildPipelineEntry(study({ interventions: [{ type: 'DEVICE', name: 'Stent' }] }), chembl), null);
    assert.equal(buildPipelineEntry(study({ pcd: '', interventions: [{ type: 'DRUG', name: 'A166' }] }), chembl), null);
    assert.equal(buildPipelineEntry({}, chembl), null);
  });
});

describe('buildApproval', () => {
  const nda = (overrides = {}) => ({
    application_number: 'NDA220414',
    sponsor_name: 'EMD SERONO',
    submissions: [
      { submission_type: 'SUPPL', submission_status: 'AP', submission_status_date: '20261101' },
      { submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20261110', review_priority: 'PRIORITY', submission_class_code: 'TYPE 1' },
    ],
    products: [{ brand_name: 'PIMJETMI', route: 'ORAL', active_ingredients: [{ name: 'PIMICOTINIB' }] }],
    ...overrides,
  });

  it('maps an in-window original NDA', () => {
    const a = buildApproval(nda(), '2026-06-01', '2026-11-18', chembl);
    assert.equal(a.approvalDate, '2026-11-10');
    assert.equal(a.applicationType, 'NDA');
    assert.equal(a.newMolecularEntity, true);
    assert.equal(a.reviewPriority, 'PRIORITY');
    assert.equal(a.brandName, 'PIMJETMI');
    assert.equal(a.genericName, 'PIMICOTINIB');
    assert.equal(a.route, 'ORAL');
    assert.equal(a.parentCompany, 'Merck KGaA');
  });

  it('ignores applications whose only in-window activity is a supplement', () => {
    const old = nda({ submissions: [
      { submission_type: 'SUPPL', submission_status: 'AP', submission_status_date: '20261101' },
      { submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20121226' },
    ] });
    assert.equal(buildApproval(old, '2026-06-01', '2026-11-18', chembl), null);
  });

  it('ignores generics and unapproved originals', () => {
    assert.equal(buildApproval(nda({ application_number: 'ANDA201374' }), '2026-06-01', '2026-11-18', chembl), null);
    assert.equal(buildApproval(nda({ submissions: [{ submission_type: 'ORIG', submission_status: 'TA', submission_status_date: '20261110' }] }), '2026-06-01', '2026-11-18', chembl), null);
  });

  it('does not call a non-Type-1 NDA a new molecular entity', () => {
    const reformulation = nda({ submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20261109', submission_class_code: 'TYPE 5' }] });
    assert.equal(buildApproval(reformulation, '2026-06-01', '2026-11-18', chembl).newMolecularEntity, false);
  });

  it('separates a novel biologic from a biosimilar of an older one', () => {
    const bla = (generic) => ({
      application_number: 'BLA761488',
      sponsor_name: 'X',
      submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20261113' }],
      openfda: { generic_name: [generic] },
    });
    const novel = buildApproval(bla('GEFURULIMAB'), '2026-06-01', '2026-11-18', chembl);
    const biosimilar = buildApproval(bla('RANIBIZUMAB-BLRZ'), '2026-06-01', '2026-11-18', chembl);
    assert.equal(novel.newMolecularEntity, true);
    assert.equal(biosimilar.newMolecularEntity, false);
    assert.equal(biosimilar.modality, 'antibody');
  });

  it('never classifies an unrecognised BLA as a small molecule', () => {
    const a = buildApproval({
      application_number: 'BLA761999',
      submissions: [{ submission_type: 'ORIG', submission_status: 'AP', submission_status_date: '20261113' }],
      openfda: { generic_name: ['XYZ-101'] },
    }, '2026-06-01', '2026-11-18', chembl);
    assert.notEqual(a.modality, 'small_molecule');
  });
});
