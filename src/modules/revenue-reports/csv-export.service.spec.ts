import { CsvExportService } from './csv-export.service';

describe('CsvExportService', () => {
  it('writes a Vietnamese BOM CSV and protects formula-like text', () => {
    const csv = new CsvExportService()
      .build({
        branchName: '=Nguy hiểm, "quoted"',
        paymentMethod: 'Tất cả',
        rows: [
          {
            key: '2026-07-01',
            label: '01/07/2026',
            from: '2026-07-01',
            to: '2026-07-01',
            completedOrders: 1,
            soldQuantity: 2,
            merchandiseRevenue: 100000,
            shippingRevenue: 20000,
            totalRevenue: 120000,
            averageOrderValue: 120000,
          },
        ],
      })
      .toString('utf8');
    expect(csv.startsWith('\uFEFFKỳ,Chi nhánh')).toBe(true);
    expect(csv).toContain(`"'=Nguy hiểm, ""quoted"""`);
    expect(csv).toContain(',100000,20000,120000,120000');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});
