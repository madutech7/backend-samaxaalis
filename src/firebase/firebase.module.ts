import { Module, Global, DynamicModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

const FIREBASE_APP = 'FIREBASE_APP';
const FIRESTORE = 'FIRESTORE';

@Global()
@Module({})
export class FirebaseModule {
  static forRoot(): DynamicModule {
    return {
      module: FirebaseModule,
      providers: [
        {
          provide: FIREBASE_APP,
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => {
            const projectId = configService.get<string>('FIREBASE_PROJECT_ID');
            const clientEmail = configService.get<string>(
              'FIREBASE_CLIENT_EMAIL',
            );
            let privateKey = configService.get<string>('FIREBASE_PRIVATE_KEY', '');
            if (privateKey) {
              // 1. Nettoyage basique (guillemets et sauts de ligne littéraux)
              privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n').trim();
              
              // 2. Si la clé a été aplatie sur une seule ligne (problème très fréquent avec les variables d'environnement Cloud)
              if (!privateKey.includes('\n') && privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
                const match = privateKey.match(/(-----BEGIN PRIVATE KEY-----)(.+)(-----END PRIVATE KEY-----)/);
                if (match) {
                  // Nettoyer tous les espaces dans le corps de la clé
                  const body = match[2].replace(/\s+/g, '');
                  // Reconstruire le format PEM avec des lignes de 64 caractères
                  const formattedBody = body.match(/.{1,64}/g)?.join('\n') || body;
                  privateKey = `${match[1]}\n${formattedBody}\n${match[3]}`;
                }
              }
            }
            // If we have service account credentials, use them
            if (projectId && clientEmail && privateKey) {
              return admin.initializeApp({
                credential: admin.credential.cert({
                  projectId,
                  clientEmail,
                  privateKey,
                }),
              });
            }

            // Otherwise try the default credentials (e.g., GOOGLE_APPLICATION_CREDENTIALS env var)
            return admin.initializeApp({
              credential: admin.credential.applicationDefault(),
            });
          },
        },
        {
          provide: FIRESTORE,
          inject: [FIREBASE_APP],
          useFactory: (app: admin.app.App) => app.firestore(),
        },
      ],
      exports: [FIREBASE_APP, FIRESTORE],
    };
  }
}

export { FIREBASE_APP, FIRESTORE };
