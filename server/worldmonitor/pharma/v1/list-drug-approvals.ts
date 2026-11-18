import type {
  DrugApproval,
  ListDrugApprovalsRequest,
  ListDrugApprovalsResponse,
  ServerContext,
} from '../../../../src/generated/server/worldmonitor/pharma/v1/service_server';
import { readDrugPipelineSeed } from './_shared';

const UNAVAILABLE: ListDrugApprovalsResponse = { approvals: [], total: 0, generatedAt: '', unavailable: true };

export async function listDrugApprovals(
  _ctx: ServerContext,
  _req: ListDrugApprovalsRequest,
): Promise<ListDrugApprovalsResponse> {
  try {
    const seed = await readDrugPipelineSeed();
    // An empty list is only trustworthy when the seed says openFDA answered.
    if (!seed || !Array.isArray(seed.approvals) || seed.approvalsUnavailable) return UNAVAILABLE;

    const approvals: DrugApproval[] = seed.approvals.map((a) => ({
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
    }));

    return { approvals, total: approvals.length, generatedAt: seed.generatedAt ?? '', unavailable: false };
  } catch {
    return UNAVAILABLE;
  }
}
