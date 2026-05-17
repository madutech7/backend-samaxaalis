/**
 * Transaction document interface for Firestore
 * Collection: "transactions"
 */

export enum TransactionType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum TransactionCategory {
  SALARY = 'salary',
  FREELANCE = 'freelance',
  INVESTMENT = 'investment',
  FOOD = 'food',
  HOUSING = 'housing',
  TRANSPORT = 'transport',
  UTILITIES = 'utilities',
  ENTERTAINMENT = 'entertainment',
  SHOPPING = 'shopping',
  HEALTH = 'health',
  EDUCATION = 'education',
  SAVINGS = 'savings',
  OTHER = 'other',
}

// Labels en français (correspond au modèle Swift)
export const CATEGORY_LABELS: Record<TransactionCategory, string> = {
  [TransactionCategory.SALARY]: 'Salaire',
  [TransactionCategory.FREELANCE]: 'Freelance',
  [TransactionCategory.INVESTMENT]: 'Investissement',
  [TransactionCategory.FOOD]: 'Alimentation',
  [TransactionCategory.HOUSING]: 'Logement',
  [TransactionCategory.TRANSPORT]: 'Transport',
  [TransactionCategory.UTILITIES]: 'Factures',
  [TransactionCategory.ENTERTAINMENT]: 'Loisirs',
  [TransactionCategory.SHOPPING]: 'Shopping',
  [TransactionCategory.HEALTH]: 'Santé',
  [TransactionCategory.EDUCATION]: 'Éducation',
  [TransactionCategory.SAVINGS]: 'Épargne',
  [TransactionCategory.OTHER]: 'Autre',
};

// SF Symbols (pour l'app iOS)
export const CATEGORY_ICONS: Record<TransactionCategory, string> = {
  [TransactionCategory.SALARY]: 'banknote.fill',
  [TransactionCategory.FREELANCE]: 'laptopcomputer',
  [TransactionCategory.INVESTMENT]: 'chart.line.uptrend.xyaxis',
  [TransactionCategory.FOOD]: 'fork.knife',
  [TransactionCategory.HOUSING]: 'house.fill',
  [TransactionCategory.TRANSPORT]: 'bus.fill',
  [TransactionCategory.UTILITIES]: 'bolt.circle.fill',
  [TransactionCategory.ENTERTAINMENT]: 'film.fill',
  [TransactionCategory.SHOPPING]: 'bag.fill',
  [TransactionCategory.HEALTH]: 'cross.case.fill',
  [TransactionCategory.EDUCATION]: 'graduationcap.fill',
  [TransactionCategory.SAVINGS]: 'building.columns.fill',
  [TransactionCategory.OTHER]: 'square.grid.2x2.fill',
};

// Couleurs hex (identiques à l'app iOS)
export const CATEGORY_COLORS: Record<TransactionCategory, string> = {
  [TransactionCategory.SALARY]: '#34C759',
  [TransactionCategory.FREELANCE]: '#30D158',
  [TransactionCategory.INVESTMENT]: '#32ADE6',
  [TransactionCategory.FOOD]: '#FF9500',
  [TransactionCategory.HOUSING]: '#A2845E',
  [TransactionCategory.TRANSPORT]: '#007AFF',
  [TransactionCategory.UTILITIES]: '#FFD60A',
  [TransactionCategory.ENTERTAINMENT]: '#FF375F',
  [TransactionCategory.SHOPPING]: '#AF52DE',
  [TransactionCategory.HEALTH]: '#FF3B30',
  [TransactionCategory.EDUCATION]: '#5856D6',
  [TransactionCategory.SAVINGS]: '#00C7BE',
  [TransactionCategory.OTHER]: '#8E8E93',
};

export interface TransactionDocument {
  id: string;
  userId: string;
  title: string;
  amount: number;
  type: TransactionType;
  category: TransactionCategory;
  note?: string;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}
