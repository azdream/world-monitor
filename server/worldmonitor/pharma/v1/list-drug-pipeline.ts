import type {
  DrugApproval,
  DrugPipelineEntry,
  ListDrugPipelineRequest,
  ListDrugPipelineResponse,
  PipelineFacetCount,
  ServerContext,
} from '../../../../src/generated/server/worldmonitor/pharma/v1/service_server';
import { readDrugPipelineSeed } from './_shared';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;
// Company facet is a pick-list, not a census: the long tail of one-trial sponsors stays out.
const MAX_COMPANY_FACETS = 40;

const UNAVAILABLE: ListDrugPipelineResponse = {
  entries: [], total: 0, modalityCounts: [], areaCounts: [], generatedAt: '', unavailable: true,
  approvals: [], approvalsUnavailable: true, companyCounts: [],
};

function countBy(entries: DrugPipelineEntry[], field: 'modality' | 'therapeuticArea' | 'parentCompany'): PipelineFacetCount[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    // Unmapped sponsors have no parent; they are not a category of their own.
    if (e[field]) counts.set(e[field], (counts.get(e[field]) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export async function listDrugPipeline(
  _ctx: ServerContext,
  req: ListDrugPipelineRequest,
): Promise<ListDrugPipelineResponse> {
  try {
    const seed = await readDrugPipelineSeed();
    if (!seed?.entries?.length) return UNAVAILABLE;

    const all: DrugPipelineEntry[] = seed.entries.map((e) => ({
      nctId: e.nctId ?? '',
      title: e.title ?? '',
      candidate: e.candidate ?? '',
      interventions: e.interventions ?? [],
      sponsor: e.sponsor ?? '',
      phase: e.phase ?? '',
      status: e.status ?? '',
      modality: e.modality ?? 'other',
      modalitySource: e.modalitySource ?? '',
      therapeuticArea: e.therapeuticArea ?? 'other',
      conditions: e.conditions ?? [],
      primaryCompletionDate: e.primaryCompletionDate ?? '',
      primaryCompletionActual: e.primaryCompletionActual ?? false,
      expectedDecisionFrom: e.expectedDecisionFrom ?? '',
      expectedDecisionTo: e.expectedDecisionTo ?? '',
      novel: e.novel ?? false,
      enrollment: e.enrollment ?? 0,
      parentCompany: e.parentCompany ?? '',
      hqCountry: e.hqCountry ?? '',
      sourceUrl: e.nctId ? `https://clinicaltrials.gov/study/${encodeURIComponent(e.nctId)}` : '',
    }));

    // An empty approvals list is only trustworthy when the seed says openFDA answered.
    const approvalsUnavailable = !Array.isArray(seed.approvals) || seed.approvalsUnavailable === true;
    const approvals: DrugApproval[] = approvalsUnavailable ? [] : (seed.approvals ?? []).map((a) => ({
      applicationNumber: a.applicationNumber ?? '',
      brandName: a.brandName ?? '',
      genericName: a.genericName ?? '',
      sponsor: a.sponsor ?? '',
      approvalDate: a.approvalDate ?? '',
      applicationType: a.applicationType ?? '',
      reviewPriority: a.reviewPriority ?? '',
      newMolecularEntity: a.newMolecularEntity ?? false,
      modality: a.modality ?? 'other',
      route: a.route ?? '',
      parentCompany: a.parentCompany ?? '',
    }));

    const base = req.novelOnly ? all.filter((e) => e.novel) : all;
    const modality = (req.modality ?? '').trim().toLowerCase();
    const area = (req.therapeuticArea ?? '').trim().toLowerCase();
    const company = (req.company ?? '').trim().toLowerCase();
    const matched = base.filter((e) =>
      (!modality || e.modality === modality)
      && (!area || e.therapeuticArea === area)
      && (!company || e.parentCompany.toLowerCase() === company));

    const requested = Number.isFinite(req.limit) && req.limit > 0 ? Math.floor(req.limit) : DEFAULT_LIMIT;
    const limit = Math.min(requested, MAX_LIMIT);

    return {
      entries: matched.slice(0, limit),
      total: matched.length,
      modalityCounts: countBy(base, 'modality'),
      areaCounts: countBy(base, 'therapeuticArea'),
      generatedAt: seed.generatedAt ?? '',
      unavailable: false,
      approvals,
      approvalsUnavailable,
      companyCounts: countBy(base, 'parentCompany').slice(0, MAX_COMPANY_FACETS),
    };
  } catch {
    return UNAVAILABLE;
  }
}
