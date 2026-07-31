import { AUTHORIZATION_METADATA_KEYS } from '@/modules/authorization';
import { RevenueReportsController } from './revenue-reports.controller';

describe('RevenueReportsController permissions', () => {
  it('requires read for report endpoints and both read/export for CSV', () => {
    expect(
      Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEYS.permissions,
        RevenueReportsController,
      ),
    ).toEqual(['reports.revenue.read']);
    expect(
      Reflect.getMetadata(
        AUTHORIZATION_METADATA_KEYS.permissions,
        // Metadata inspection does not invoke the detached controller method.
        // eslint-disable-next-line @typescript-eslint/unbound-method
        RevenueReportsController.prototype.export,
      ),
    ).toEqual(['reports.export']);
  });
});
