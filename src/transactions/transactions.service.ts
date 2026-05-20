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

    let ref: FirebaseFirestore.Query = this.collection.where(
      'userId',
      '==',
      userId,
    );

    if (type) {
      ref = ref.where('type', '==', type);
    }

    if (category) {
      ref = ref.where('category', '==', category);
    }

    if (startDate) {
      ref = ref.where('date', '>=', new Date(startDate));
    }

    if (endDate) {
      ref = ref.where('date', '<=', new Date(endDate));
    }

    ref = ref.orderBy('date', 'desc');

    // Get total count
    const countSnapshot = await ref.count().get();
    const total = countSnapshot.data().count;

    // Paginate
    const offset = (page - 1) * limit;
    const snapshot = await ref.offset(offset).limit(limit).get();

    let data = snapshot.docs.map(
      (doc) => ({ id: doc.id, ...doc.data() }) as TransactionDocument,
    );

    // Client-side search (Firestore doesn't support ILIKE)
    if (search) {
      const searchLower = search.toLowerCase();
      data = data.filter(
        (t) =>
          t.title.toLowerCase().includes(searchLower) ||
          (t.note && t.note.toLowerCase().includes(searchLower)),
      );
    }

    return {
      data,
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

    return { id: doc.id, ...data };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateTransactionDto,
  ): Promise<TransactionDocument> {
    const transaction = await this.findOne(userId, id);
    const updates: Record<string, any> = {
      ...dto,
      updatedAt: new Date(),
    };
    if (dto.date) {
      updates.date = new Date(dto.date);
    }

    await this.collection.doc(id).update(updates);
    return { ...transaction, ...updates };
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id); // Verify ownership
    await this.collection.doc(id).delete();
  }

  // ─── Statistics helpers ──────────────────────────────────────────

  async getTotalBalance(userId: string): Promise<number> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .get();

    let balance = 0;
    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.type === TransactionType.INCOME) {
        balance += Number(data.amount);
      } else {
        balance -= Number(data.amount);
      }
    });

    return Math.round(balance * 100) / 100;
  }

  async getTotalsByType(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ income: number; expenses: number }> {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    let income = 0;
    let expenses = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      if (data.type === TransactionType.INCOME) {
        income += Number(data.amount);
      } else {
        expenses += Number(data.amount);
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
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('type', '==', TransactionType.EXPENSE)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    const categoryTotals: Record<string, number> = {};
    let total = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const amount = Number(data.amount);
      categoryTotals[data.category] =
        (categoryTotals[data.category] ?? 0) + amount;
      total += amount;
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
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('type', '==', TransactionType.INCOME)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    const categoryTotals: Record<string, number> = {};
    let total = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const amount = Number(data.amount);
      categoryTotals[data.category] =
        (categoryTotals[data.category] ?? 0) + amount;
      total += amount;
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

    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('type', '==', TransactionType.EXPENSE)
      .where('date', '>=', startDate)
      .orderBy('date', 'asc')
      .get();

    const dailyTotals: Record<string, number> = {};

    // Initialize all days with 0
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyTotals[key] = 0;
    }

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const date = data.date.toDate
        ? data.date.toDate()
        : new Date(data.date);
      const key = date.toISOString().split('T')[0];
      if (dailyTotals[key] !== undefined) {
        dailyTotals[key] += Number(data.amount);
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

    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('date', '>=', startDate)
      .orderBy('date', 'asc')
      .get();

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

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      const date = data.date.toDate
        ? data.date.toDate()
        : new Date(data.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (monthlyData[key]) {
        if (data.type === TransactionType.INCOME) {
          monthlyData[key].income += Number(data.amount);
        } else {
          monthlyData[key].expenses += Number(data.amount);
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
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .where('type', '==', TransactionType.EXPENSE)
      .where('category', '==', category)
      .where('date', '>=', startDate)
      .where('date', '<=', endDate)
      .get();

    let spent = 0;
    snapshot.docs.forEach((doc) => {
      spent += Number(doc.data().amount);
    });

    return Math.round(spent * 100) / 100;
  }
}
