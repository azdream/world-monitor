export const config = { runtime: 'edge' };

import { createDomainGateway, serverOptions } from '../../../server/gateway';
import { createPharmaServiceRoutes } from '../../../src/generated/server/worldmonitor/pharma/v1/service_server';
import { pharmaHandler } from '../../../server/worldmonitor/pharma/v1/handler';

export default createDomainGateway(
  createPharmaServiceRoutes(pharmaHandler, serverOptions),
);
