import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StatisticsService } from './statistics.service';

@ApiTags('statistics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('statistics')
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Résumé financier (solde, revenus, dépenses, taux d\'épargne)',
  })
  @ApiQuery({ name: 'startDate', required: false, example: '2026-05-01' })
  @ApiQuery({ name: 'endDate', required: false, example: '2026-05-31' })
  @ApiResponse({ status: 200, description: 'Résumé financier' })
  async getSummary(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.statisticsService.getSummary(req.user.id, startDate, endDate);
  }

  @Get('expenses-by-category')
  @ApiOperation({ summary: 'Répartition des dépenses par catégorie' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Dépenses par catégorie' })
  async getExpensesByCategory(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.statisticsService.getExpensesByCategory(
      req.user.id,
      startDate,
      endDate,
    );
  }

  @Get('income-by-category')
  @ApiOperation({ summary: 'Répartition des revenus par catégorie' })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiResponse({ status: 200, description: 'Revenus par catégorie' })
  async getIncomeByCategory(
    @Request() req: any,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.statisticsService.getIncomeByCategory(
      req.user.id,
      startDate,
      endDate,
    );
  }

  @Get('daily-expenses')
  @ApiOperation({ summary: 'Dépenses quotidiennes (7 derniers jours)' })
  @ApiQuery({ name: 'days', required: false, example: 7 })
  @ApiResponse({ status: 200, description: 'Dépenses quotidiennes' })
  async getDailyExpenses(
    @Request() req: any,
    @Query('days') days?: number,
  ) {
    return this.statisticsService.getDailyExpenses(req.user.id, days ?? 7);
  }

  @Get('monthly-trend')
  @ApiOperation({ summary: 'Tendance mensuelle (6 derniers mois)' })
  @ApiQuery({ name: 'months', required: false, example: 6 })
  @ApiResponse({ status: 200, description: 'Tendance mensuelle' })
  async getMonthlyTrend(
    @Request() req: any,
    @Query('months') months?: number,
  ) {
    return this.statisticsService.getMonthlyTrend(req.user.id, months ?? 6);
  }
}
