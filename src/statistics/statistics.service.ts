import { Injectable } from '@nestjs/common';
import { TransactionsService } from '../transactions/transactions.service';
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  TransactionCategory,
} from '../transactions/entities/transaction.entity';

@Injectable()
export class StatisticsService {
  constructor(
    private readonly transactionsService: TransactionsService,
  ) {}

  async getSummary(userId: string, startDate?: string, endDate?: string) {
    const now = new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;

    const [balance, totals] = await Promise.all([
      this.transactionsService.getTotalBalance(userId),
      this.transactionsService.getTotalsByType(userId, start, end),
    ]);

    const savingsRate =
      totals.income > 0
        ? ((totals.income - totals.expenses) / totals.income) * 100
        : 0;

    return {
      balance,
      income: totals.income,
      expenses: totals.expenses,
      savingsRate: Math.round(savingsRate * 100) / 100,
      period: { startDate: start, endDate: end },
    };
  }

  async getExpensesByCategory(
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const now = new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;

    const data = await this.transactionsService.getExpensesByCategory(
      userId,
      start,
      end,
    );

    return data.map((item) => ({
      ...item,
      label:
        CATEGORY_LABELS[item.category as TransactionCategory] ?? item.category,
      icon:
        CATEGORY_ICONS[item.category as TransactionCategory] ??
        'square.grid.2x2.fill',
      color:
        CATEGORY_COLORS[item.category as TransactionCategory] ?? '#8E8E93',
    }));
  }

  async getIncomeByCategory(
    userId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const now = new Date();
    const start = startDate
      ? new Date(startDate)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const end = endDate ? new Date(endDate) : now;

    const data = await this.transactionsService.getIncomeByCategory(
      userId,
      start,
      end,
    );

    return data.map((item) => ({
      ...item,
      label:
        CATEGORY_LABELS[item.category as TransactionCategory] ?? item.category,
      icon:
        CATEGORY_ICONS[item.category as TransactionCategory] ??
        'square.grid.2x2.fill',
      color:
        CATEGORY_COLORS[item.category as TransactionCategory] ?? '#8E8E93',
    }));
  }

  async getDailyExpenses(userId: string, days: number = 7) {
    return this.transactionsService.getDailyExpenses(userId, days);
  }

  async getMonthlyTrend(userId: string, months: number = 6) {
    return this.transactionsService.getMonthlyTrend(userId, months);
  }
}
