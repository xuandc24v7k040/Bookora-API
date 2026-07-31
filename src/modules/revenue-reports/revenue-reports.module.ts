import { Module } from '@nestjs/common';
import { AuthorizationModule } from '@/modules/authorization';
import { CsvExportService } from './csv-export.service';
import { RevenueReportsController } from './revenue-reports.controller';
import { RevenueReportsRepository } from './revenue-reports.repository';
import { RevenueReportsService } from './revenue-reports.service';

@Module({
  imports: [AuthorizationModule],
  controllers: [RevenueReportsController],
  providers: [
    CsvExportService,
    RevenueReportsRepository,
    RevenueReportsService,
  ],
})
export class RevenueReportsModule {}
