import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module';
import { BudgetDocument, BudgetPeriod } from './entities/budget.entity';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { TransactionsService } from '../transactions/transactions.service';
import { randomUUID } from 'crypto';

@Injectable()
export class BudgetsService {
  private readonly collection;

  constructor(
    @Inject(FIRESTORE) private readonly firestore: Firestore,
    private readonly transactionsService: TransactionsService,
  ) {
    this.collection = this.firestore.collection('budgets');
  }

  async create(userId: string, dto: CreateBudgetDto): Promise<BudgetDocument> {
    // Check for existing budget on this category
    const existing = await this.collection
      .where('userId', '==', userId)
      .where('category', '==', dto.category)
      .limit(1)
      .get();

    if (!existing.empty) {
      throw new ConflictException(
        `Un budget existe déjà pour la catégorie "${dto.category}"`,
      );
    }

    const id = dto.id ?? randomUUID();
    const now = new Date();

    const budget: Omit<BudgetDocument, 'id'> = {
      userId,
      category: dto.category,
      limitAmount: dto.limitAmount,
      period: dto.period ?? BudgetPeriod.MONTHLY,
      isActive: dto.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    await this.collection.doc(id).set(budget);
    return { id, ...budget };
  }

  private mapBudget(doc: FirebaseFirestore.DocumentSnapshot): BudgetDocument {
    const data = doc.data() || {};
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(),
      updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt)) : new Date(),
    } as BudgetDocument;
  }

  async findAll(userId: string) {
    const snapshot = await this.collection
      .where('userId', '==', userId)
      .get();

    const budgets = snapshot.docs.map((doc) => this.mapBudget(doc));

    // Sort in memory by createdAt desc
    budgets.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Enrich with progress
    const enriched = await Promise.all(
      budgets.map(async (budget) => {
        const progress = await this.getProgress(userId, budget);
        return {
          ...budget,
          spent: progress.spent,
          percentage: progress.percentage,
          isOverBudget: progress.percentage > 100,
        };
      }),
    );

    return enriched;
  }

  async findOne(userId: string, id: string) {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      throw new NotFoundException('Budget non trouvé');
    }

    const budget = this.mapBudget(doc);
    if (budget.userId !== userId) {
      throw new NotFoundException('Budget non trouvé');
    }

    const progress = await this.getProgress(userId, budget);
    return {
      ...budget,
      spent: progress.spent,
      percentage: progress.percentage,
      isOverBudget: progress.percentage > 100,
    };
  }

  async update(
    userId: string,
    id: string,
    dto: UpdateBudgetDto,
  ): Promise<BudgetDocument> {
    await this.findOne(userId, id); // Verify ownership
    
    const updates = {
      ...dto,
      updatedAt: new Date(),
    };

    await this.collection.doc(id).update(updates);
    return this.findOne(userId, id);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(userId, id); // Verify ownership
    await this.collection.doc(id).delete();
  }

  private async getProgress(
    userId: string,
    budget: BudgetDocument,
  ): Promise<{ spent: number; percentage: number }> {
    const { startDate, endDate } = this.getPeriodRange(budget.period);

    const spent = await this.transactionsService.getSpentForBudget(
      userId,
      budget.category,
      startDate,
      endDate,
    );

    const limit = Number(budget.limitAmount);
    const percentage = limit > 0 ? (spent / limit) * 100 : 0;

    return {
      spent,
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  private getPeriodRange(period: BudgetPeriod): {
    startDate: Date;
    endDate: Date;
  } {
    const now = new Date();
    const endDate = now;
    let startDate: Date;

    switch (period) {
      case BudgetPeriod.WEEKLY:
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 7);
        break;
      case BudgetPeriod.MONTHLY:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case BudgetPeriod.YEARLY:
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return { startDate, endDate };
  }
}
