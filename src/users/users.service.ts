import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase.module';
import { UserDocument } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class UsersService {
  private readonly collection;

  constructor(@Inject(FIRESTORE) private readonly firestore: Firestore) {
    this.collection = this.firestore.collection('users');
  }

  async findByEmail(email: string): Promise<UserDocument | null> {
    const snapshot = await this.collection
      .where('email', '==', email)
      .limit(1)
      .get();

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as UserDocument;
  }

  async findById(id: string): Promise<UserDocument> {
    const doc = await this.collection.doc(id).get();
    if (!doc.exists) {
      throw new NotFoundException('Utilisateur non trouvé');
    }
    return { id: doc.id, ...doc.data() } as UserDocument;
  }

  async create(data: Partial<UserDocument>): Promise<UserDocument> {
    const id = randomUUID();
    const now = new Date();

    const user: Omit<UserDocument, 'id'> = {
      email: data.email!,
      password: data.password!,
      name: data.name!,
      currency: data.currency ?? 'EUR',
      refreshToken: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.collection.doc(id).set(user);
    return { id, ...user };
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserDocument> {
    const user = await this.findById(id);
    const updates = {
      ...dto,
      updatedAt: new Date(),
    };

    await this.collection.doc(id).update(updates);
    return { ...user, ...updates };
  }

  async updateRefreshToken(
    id: string,
    refreshToken: string | null,
  ): Promise<void> {
    await this.collection.doc(id).update({
      refreshToken,
      updatedAt: new Date(),
    });
  }

  async remove(id: string): Promise<void> {
    const user = await this.findById(id);

    // Delete user's transactions
    const txSnapshot = await this.firestore
      .collection('transactions')
      .where('userId', '==', id)
      .get();
    const batch1 = this.firestore.batch();
    txSnapshot.docs.forEach((doc) => batch1.delete(doc.ref));
    if (!txSnapshot.empty) await batch1.commit();

    // Delete user's budgets
    const budgetSnapshot = await this.firestore
      .collection('budgets')
      .where('userId', '==', id)
      .get();
    const batch2 = this.firestore.batch();
    budgetSnapshot.docs.forEach((doc) => batch2.delete(doc.ref));
    if (!budgetSnapshot.empty) await batch2.commit();

    // Delete user
    await this.collection.doc(id).delete();
  }
}
