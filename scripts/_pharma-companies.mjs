// Hand-curated roll-up of trial sponsors and FDA applicants to a parent company.
//
// ClinicalTrials.gov and Drugs@FDA name the legal entity that filed, which is
// often a subsidiary ("Janssen Research & Development, LLC", "Suzhou Suncadia
// Biopharmaceuticals"). Neither source carries a parent or a headquarters, so
// this table is the only place that knowledge lives.
//
// Rules for editing:
//   - Add a company only when the parent relationship is settled public
//     record. A sponsor with no entry is shown under its registered name; that
//     is always preferable to a wrong roll-up.
//   - `hq` is the ISO 3166-1 alpha-2 country of the parent's headquarters.
//     Leave a company out rather than guess when domicile and operating base
//     differ in a way readers would dispute.
//   - Aliases are matched as whole-word sequences against the normalized
//     sponsor name (lowercase, punctuation → spaces). Keep them specific:
//     bare "Merck" is two unrelated companies, so neither entry claims it.
//     Bare "Roche" would also claim La Roche-Posay (L'Oreal).
//   - Separately listed affiliates (e.g. Chugai, Sandoz) are their own parents.
//
// Reviewed 2026-11. Ownership changes: update here, not in the seeder.

/** @type {Array<{name: string, hq: string, aliases: string[]}>} */
export const PHARMA_PARENTS = [
  // United States
  { name: 'Pfizer', hq: 'US', aliases: ['pfizer', 'seagen', 'wyeth'] },
  { name: 'Merck & Co. (MSD)', hq: 'US', aliases: ['merck sharp dohme', 'msd'] },
  { name: 'Johnson & Johnson', hq: 'US', aliases: ['johnson johnson', 'janssen', 'actelion'] },
  { name: 'Eli Lilly', hq: 'US', aliases: ['eli lilly', 'lilly'] },
  { name: 'AbbVie', hq: 'US', aliases: ['abbvie', 'allergan'] },
  { name: 'Bristol Myers Squibb', hq: 'US', aliases: ['bristol myers squibb', 'celgene', 'juno therapeutics'] },
  { name: 'Amgen', hq: 'US', aliases: ['amgen', 'horizon therapeutics'] },
  { name: 'Gilead Sciences', hq: 'US', aliases: ['gilead', 'kite pharma'] },
  { name: 'Regeneron', hq: 'US', aliases: ['regeneron'] },
  { name: 'Vertex', hq: 'US', aliases: ['vertex pharmaceuticals', 'vertex pharms'] },
  { name: 'Biogen', hq: 'US', aliases: ['biogen'] },
  { name: 'Moderna', hq: 'US', aliases: ['moderna', 'modernatx'] },
  { name: 'Incyte', hq: 'US', aliases: ['incyte'] },
  { name: 'Alnylam', hq: 'US', aliases: ['alnylam'] },
  { name: 'Organon', hq: 'US', aliases: ['organon'] },
  { name: 'Viatris', hq: 'US', aliases: ['viatris', 'mylan'] },
  { name: 'Colgate-Palmolive', hq: 'US', aliases: ['colgate palmolive'] },
  // Europe
  { name: 'Roche', hq: 'CH', aliases: ['hoffmann la roche', 'f hoffmann', 'roche pharma', 'roche products', 'genentech'] },
  { name: 'Novartis', hq: 'CH', aliases: ['novartis'] },
  { name: 'Sandoz', hq: 'CH', aliases: ['sandoz'] },
  { name: 'Galderma', hq: 'CH', aliases: ['galderma'] },
  { name: 'Ferring', hq: 'CH', aliases: ['ferring'] },
  { name: 'Idorsia', hq: 'CH', aliases: ['idorsia'] },
  { name: 'Sanofi', hq: 'FR', aliases: ['sanofi', 'genzyme'] },
  { name: 'Ipsen', hq: 'FR', aliases: ['ipsen'] },
  { name: 'Servier', hq: 'FR', aliases: ['servier'] },
  { name: 'AstraZeneca', hq: 'GB', aliases: ['astrazeneca', 'alexion', 'medimmune'] },
  { name: 'GSK', hq: 'GB', aliases: ['glaxosmithkline', 'gsk', 'viiv healthcare'] },
  { name: 'Novo Nordisk', hq: 'DK', aliases: ['novo nordisk'] },
  { name: 'Lundbeck', hq: 'DK', aliases: ['lundbeck'] },
  { name: 'Genmab', hq: 'DK', aliases: ['genmab'] },
  { name: 'Ascendis Pharma', hq: 'DK', aliases: ['ascendis'] },
  { name: 'Zealand Pharma', hq: 'DK', aliases: ['zealand pharma'] },
  { name: 'Bayer', hq: 'DE', aliases: ['bayer'] },
  { name: 'Boehringer Ingelheim', hq: 'DE', aliases: ['boehringer ingelheim'] },
  { name: 'Merck KGaA', hq: 'DE', aliases: ['merck kgaa', 'merck healthcare kgaa', 'emd serono', 'merck serono'] },
  { name: 'BioNTech', hq: 'DE', aliases: ['biontech'] },
  { name: 'UCB', hq: 'BE', aliases: ['ucb'] },
  { name: 'Chiesi', hq: 'IT', aliases: ['chiesi'] },
  { name: 'Menarini', hq: 'IT', aliases: ['menarini'] },
  { name: 'Almirall', hq: 'ES', aliases: ['almirall'] },
  { name: 'Grifols', hq: 'ES', aliases: ['grifols'] },
  // Japan
  { name: 'Takeda', hq: 'JP', aliases: ['takeda', 'shire', 'millennium pharmaceuticals'] },
  { name: 'Daiichi Sankyo', hq: 'JP', aliases: ['daiichi sankyo'] },
  { name: 'Astellas', hq: 'JP', aliases: ['astellas'] },
  { name: 'Eisai', hq: 'JP', aliases: ['eisai'] },
  { name: 'Otsuka', hq: 'JP', aliases: ['otsuka'] },
  { name: 'Chugai', hq: 'JP', aliases: ['chugai'] },
  // China
  { name: 'Jiangsu Hengrui', hq: 'CN', aliases: ['hengrui', 'suzhou suncadia', 'shandong suncadia', 'fujian shengdi'] },
  { name: 'CSPC Pharmaceutical', hq: 'CN', aliases: ['cspc', 'shanghai jmt bio'] },
  { name: 'Sino Biopharmaceutical', hq: 'CN', aliases: ['sino biopharmaceutical', 'chia tai tianqing'] },
  { name: 'Sichuan Biokin', hq: 'CN', aliases: ['biokin', 'sichuan baili', 'baili bio'] },
  { name: 'Kelun Pharmaceutical', hq: 'CN', aliases: ['kelun'] },
  { name: 'Huadong Medicine', hq: 'CN', aliases: ['huadong medicine', 'zhongmei huadong'] },
  { name: 'Innovent Biologics', hq: 'CN', aliases: ['innovent'] },
  { name: 'Akeso', hq: 'CN', aliases: ['akeso'] },
  { name: 'Qilu Pharmaceutical', hq: 'CN', aliases: ['qilu pharmaceutical'] },
  { name: 'Hansoh Pharma', hq: 'CN', aliases: ['hansoh'] },
  { name: 'Sinovac', hq: 'CN', aliases: ['sinovac'] },
  { name: 'Gan & Lee', hq: 'CN', aliases: ['gan lee'] },
  { name: 'Tasly', hq: 'CN', aliases: ['tasly'] },
  { name: 'Zai Lab', hq: 'CN', aliases: ['zai lab'] },
  { name: 'Junshi Biosciences', hq: 'CN', aliases: ['junshi'] },
  // South Korea
  { name: 'Celltrion', hq: 'KR', aliases: ['celltrion'] },
  { name: 'Samsung Bioepis', hq: 'KR', aliases: ['samsung bioepis'] },
  { name: 'Hanmi Pharmaceutical', hq: 'KR', aliases: ['hanmi'] },
  { name: 'Yuhan', hq: 'KR', aliases: ['yuhan'] },
  { name: 'Daewoong', hq: 'KR', aliases: ['daewoong'] },
  { name: 'Chong Kun Dang', hq: 'KR', aliases: ['chong kun dang'] },
  { name: 'Dong-A ST', hq: 'KR', aliases: ['dong a st'] },
  { name: 'GC (Green Cross)', hq: 'KR', aliases: ['gc biopharma', 'green cross'] },
  { name: 'SK bioscience', hq: 'KR', aliases: ['sk bioscience'] },
  { name: 'SK Biopharmaceuticals', hq: 'KR', aliases: ['sk biopharmaceuticals', 'sk life science'] },
  { name: 'LG Chem', hq: 'KR', aliases: ['lg chem'] },
  { name: 'HK inno.N', hq: 'KR', aliases: ['hk inno n'] },
  // India, Israel, Australia
  { name: 'Sun Pharma', hq: 'IN', aliases: ['sun pharma', 'sun pharmaceutical'] },
  { name: "Dr. Reddy's", hq: 'IN', aliases: ['dr reddy s', 'dr reddys'] },
  { name: 'Cipla', hq: 'IN', aliases: ['cipla'] },
  { name: 'Lupin', hq: 'IN', aliases: ['lupin'] },
  { name: 'Zydus', hq: 'IN', aliases: ['zydus'] },
  { name: 'Biocon', hq: 'IN', aliases: ['biocon'] },
  { name: 'Glenmark', hq: 'IN', aliases: ['glenmark'] },
  { name: 'Teva', hq: 'IL', aliases: ['teva'] },
  { name: 'CSL', hq: 'AU', aliases: ['csl', 'seqirus'] },
];

/** Lowercase, fold "&" and punctuation to spaces, collapse whitespace. */
export function normalizeCompanyName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Longest alias first, so "merck kgaa" is tried before any shorter alias that
// could also sit inside the same sponsor string.
const ALIAS_INDEX = PHARMA_PARENTS
  .flatMap((parent) => parent.aliases.map((alias) => ({ alias: normalizeCompanyName(alias), parent })))
  .sort((a, b) => b.alias.length - a.alias.length);

/**
 * Resolve a registered sponsor / applicant name to its parent company.
 * @returns {{name: string, hq: string} | null} null when the table has no entry
 */
export function resolveParentCompany(sponsor) {
  const padded = ` ${normalizeCompanyName(sponsor)} `;
  if (padded.trim() === '') return null;
  for (const { alias, parent } of ALIAS_INDEX) {
    if (padded.includes(` ${alias} `)) return { name: parent.name, hq: parent.hq };
  }
  return null;
}
