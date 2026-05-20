import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module';
import { TransactionDocument, TransactionType } from './entities/transaction.entity';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class TransactionsService {
  private readonly collection;

  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {
    this.collection = this.firestore.collection('transactions');
  }

  async create(
    userId: string,
    dto: CreateTransactionDto,
  ): Promise<TransactionDocument> {
    const id = dto.id ?? randomUUID();
    const now = new Date();

    const transaction: Omit<TransactionDocument, 'id'> = {
      userId,
      title: dto.title,
      amount: dto.amount,
      type: dto.type,
      category: dto.category,
      note: dto.note ?? undefined,
      date: new Date(dto.date),
      createdAt: now,
      updatedAt: now,
    };

    await this.collection.doc(id).set(transaction);
    return { id, ...transaction };
  }

  private async getUserTransactions(userId: string): Promise<TransactionDocument[]> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .get();

    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        date: data.date ? (data.date.toDate ? data.date.toDate() : new Date(data.date)) : new Date(),
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(),
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : new Date(),
      } as TransactionDocument;
    });
  }

  async findAll(userId: string, query: QueryTransactionDto) {
    const {
      type,
      category,
      startDate,
      endDate,
      search,
      page = 1,
      limit = 20,
    } = query;

    let data = await this.getUserTransactions(userId);

    if (type) {
      data = data.filter((t) => t.type === type);
    }

    if (category) {
      data = data.filter((t) => t.category === category);
    }

    if (startDate) {
      const start = new Date(startDate);
      data = data.filter((t) => t.date >= start);
    }

    if (endDate) {
      const end = new Date(endDate);
      data = data.filter((t) => t.date <= end);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(
        (t) =>
          t.title.toLowerCase().includes(searchLower) ||
          (t.note && t.note.toLowerCase().includes(searchLower)),
      );
    }

    // Sort by date desc
    data.sort((a, b) => b.date.getTime() - a.date.getTime());

    const total = data.length;
    const offset = (page - 1) * limit;
    const paginated = data.slice(offset, offset + limit);

    return {
      data: paginated,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(userId: string, id: string): Promise<TransactionDocument> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      throw new NotFoundException('Transaction non trouvée');
    }

    const data = doc.data() as Omit<TransactionDocument, 'id'>;
    if (data.userId !== userId) {
      throw new NotFoundException('Transaction non trouvée');
    }

    return {
      id: doc.id,
      ...data,
      date: data.date ? ((data.date as any).toDate ? (data.date as any).toDate() : new Date(data.date)) : new Date(),
      createdAt: data.createdAt ? ((data.createdAt as any).toDate ? (data.createdAt as any).toDate() : new Date(data.createdAt)) : new Date(),
      updatedAt: data.updatedAt ? ((data.updatedAt as any).toDate ? (data.updatedAt as any).toDate() : new Date(data.updatedAt)) : new Date(),
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionDocument> {
    await this.findOne(userId, id); // Verify ownership
    
    const updates: Record<string, any> = {
      ...dto,
      updatedAt: new Date(),
    };
    if (dto.date) {
      updates.date = new Date(dto.date);
    }

    await this.collection.doc(id).update(updates);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id); // Verify ownership
    await this.collection.doc(id).delete();
  }

  // ─── Statistics helpers ──────────────────────────────────────────

  async getTotalBalance(userId: string): Promise<number> {
    const data = await this.getUserTransactions(userId);
    let balance = 0;
    data.forEach((t) => {
      if (t.type === TransactionType.INCOME) {
        balance += Number(t.amount);
      } else {
        balance -= Number(t.amount);
      }
    });
    return Math.round(balance * 100) / 100;
  }

  async getTotalsByType(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ income: number; expenses: number }> {
    const data = await this.getUserTransactions(userId);
    let income = 0;
    let expenses = 0;

    data.forEach((t) => {
      if (t.date >= startDate && t.date <= endDate) {
        if (t.type === TransactionType.INCOME) {
          income += Number(t.amount);
        } else {
          expenses += Number(t.amount);
        }
      }
    });

    return {
      income: Math.round(income * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
    };
  }

  async getExpensesByCategory(
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const data = await this.getUserTransactions(userId);
    const categoryTotals: Record<string, number> = {};
    let total = 0;

    data.forEach((t) => {
      if (t.type === TransactionType.EXPENSE && t.date >= startDate && t.date <= endDate) {
        const amount = Number(t.amount);
        categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + amount;
        total += amount;
      }
    });

    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
        percentage: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  async getIncomeByCategory(
    userId: string,
    startDate: Date,
    endDate: Date,
  ) {
    const data = await this.getUserTransactions(userId);
    const categoryTotals: Record<string, number> = {};
    let total = 0;

    data.forEach((t) => {
      if (t.type === TransactionType.INCOME && t.date >= startDate && t.date <= endDate) {
        const amount = Number(t.amount);
        categoryTotals[t.category] = (categoryTotals[t.category] ?? 0) + amount;
        total += amount;
      }
    });

    return Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount: Math.round(amount * 100) / 100,
        percentage: total > 0 ? Math.round((amount / total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  async getDailyExpenses(userId: string, days: number = 7) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    const data = await this.getUserTransactions(userId);
    const dailyTotals: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyTotals[key] = 0;
    }

    data.forEach((t) => {
      if (t.type === TransactionType.EXPENSE && t.date >= startDate) {
        const key = t.date.toISOString().split('T')[0];
        if (dailyTotals[key] !== undefined) {
          dailyTotals[key] += Number(t.amount);
        }
      }
    });

    return Object.entries(dailyTotals).map(([day, amount]) => ({
      day,
      amount: Math.round(amount * 100) / 100,
    }));
  }

  async getMonthlyTrend(userId: string, months: number = 6) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const data = await this.getUserTransactions(userId);
    const monthlyData: Record<
      string,
      { income: number; expenses: number }
    > = {};

    // Initialize months
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyData[key] = { income: 0, expenses: 0 };
    }

    data.forEach((t) => {
      if (t.date >= startDate) {
        const key = `${t.date.getFullYear()}-${String(t.date.getMonth() + 1).padStart(2, '0')}`;
        if (monthlyData[key]) {
          if (t.type === TransactionType.INCOME) {
            monthlyData[key].income += Number(t.amount);
          } else {
            monthlyData[key].expenses += Number(t.amount);
          }
        }
      }
    });

    return Object.entries(monthlyData).map(([month, data]) => ({
      month,
      income: Math.round(data.income * 100) / 100,
      expenses: Math.round(data.expenses * 100) / 100,
    }));
  }

  async getSpentForBudget(
    userId: string,
    category: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const data = await this.getUserTransactions(userId);
    let spent = 0;

    data.forEach((t) => {
      if (t.type === TransactionType.EXPENSE && t.category === category && t.date >= startDate && t.date <= endDate) {
        spent += Number(t.amount);
      }
    });

    return Math.round(spent * 100) / 100;
  }
}

