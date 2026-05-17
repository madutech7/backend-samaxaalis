/**
 * Budget document interface for Firestore
 * Collection: "budgets"
 */
import { TransactionCategory } from '../../transactions/entities/transaction.entity';

export enum BudgetPeriod {
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export interface BudgetDocument {
  id: string;
  userId: string;
  category: TransactionCategory;
  limitAmount: number;
  period: BudgetPeriod;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
