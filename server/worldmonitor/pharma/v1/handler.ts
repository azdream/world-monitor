import type { PharmaServiceHandler } from '../../../../src/generated/server/worldmonitor/pharma/v1/service_server';

import { listDrugPipeline } from './list-drug-pipeline';

export const pharmaHandler: PharmaServiceHandler = {
  listDrugPipeline,
};
