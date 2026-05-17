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
            const base64ServiceAccount = configService.get<string>('FIREBASE_SERVICE_ACCOUNT_BASE64');
            if (base64ServiceAccount) {
              const decoded = Buffer.from(base64ServiceAccount, 'base64').toString('utf8');
              const credentials = JSON.parse(decoded);
              return admin.initializeApp({
                credential: admin.credential.cert(credentials),
              });
            }

            const projectId = configService.get<string>('FIREBASE_PROJECT_ID');
            const clientEmail = configService.get<string>(
              'FIREBASE_CLIENT_EMAIL',
            );
            let privateKey = configService.get<string>('FIREBASE_PRIVATE_KEY', '');
            if (privateKey) {
              // Enlever les guillemets éventuels
              privateKey = privateKey.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
              
              const beginMarker = '-----BEGIN PRIVATE KEY-----';
              const endMarker = '-----END PRIVATE KEY-----';
              
              if (privateKey.includes(beginMarker) && privateKey.includes(endMarker)) {
                // Extraire uniquement le corps de la clé
                let body = privateKey.split(beginMarker)[1].split(endMarker)[0];
                // Supprimer ABSOLUMENT tous les espaces, retours à la ligne, et tabulations du corps
                body = body.replace(/\s+/g, '');
                // Découper proprement en blocs de 64 caractères
                const formattedBody = body.match(/.{1,64}/g)?.join('\n') || body;
                // Reconstruire le certificat parfait
                privateKey = `${beginMarker}\n${formattedBody}\n${endMarker}\n`;
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
