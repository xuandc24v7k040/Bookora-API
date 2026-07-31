import { Injectable } from '@nestjs/common';
import type { RevenueTableRowDto } from './dto';

function sanitizeText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsv(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : sanitizeText(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

@Injectable()
export class CsvExportService {
  build(input: {
    rows: RevenueTableRowDto[];
    branchName: string;
    paymentMethod: string;
  }): Buffer {
    const headers = [
      'Kỳ',
      'Chi nhánh',
      'Phương thức thanh toán',
      'Đơn hoàn tất',
      'Sản phẩm bán',
      'Tiền hàng',
      'Phí vận chuyển',
      'Tổng doanh thu',
      'Giá trị đơn trung bình',
    ];
    const lines = [
      headers.map(escapeCsv).join(','),
      ...input.rows.map((row) =>
        [
          row.label,
          input.branchName,
          input.paymentMethod,
          row.completedOrders,
          row.soldQuantity,
          row.merchandiseRevenue,
          row.shippingRevenue,
          row.totalRevenue,
          row.averageOrderValue,
        ]
          .map(escapeCsv)
          .join(','),
      ),
    ];
    return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
  }
}
