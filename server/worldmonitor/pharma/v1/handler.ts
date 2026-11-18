import type { PharmaServiceHandler } from '../../../../src/generated/server/worldmonitor/pharma/v1/service_server';

import { listDrugApprovals } from './list-drug-approvals';
import { listDrugPipeline } from './list-drug-pipeline';

export const pharmaHandler: PharmaServiceHandler = {
  listDrugApprovals,
  listDrugPipeline,
};
