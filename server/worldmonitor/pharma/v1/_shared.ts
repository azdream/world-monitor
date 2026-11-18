import type {
  DrugApproval,
  DrugPipelineEntry,
} from '../../../../src/generated/server/worldmonitor/pharma/v1/service_server';
import { getCachedJson } from '../../../_shared/redis';

// Written by scripts/seed-drug-pipeline.mjs (pipeline + approvals in one payload).
export const DRUG_PIPELINE_SEED_KEY = 'pharma:drug-pipeline:v1';

export interface DrugPipelineSeed {
  entries?: Array<Partial<Omit<DrugPipelineEntry, 'sourceUrl'>>>;
  approvals?: Array<Partial<DrugApproval>>;
  generatedAt?: string;
  approvalsUnavailable?: boolean;
}

export async function readDrugPipelineSeed(): Promise<DrugPipelineSeed | null> {
  return await getCachedJson(DRUG_PIPELINE_SEED_KEY, true) as DrugPipelineSeed | null;
}
