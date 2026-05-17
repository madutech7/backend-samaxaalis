import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    }),
  );
  app.enableCors({
    origin: '*', // Configure for production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('GestFina API — Samaxaalis')
    .setDescription(
      'API REST pour la gestion financière personnelle. ' +
        'Gère les transactions, budgets, catégories et statistiques.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Authentification et gestion de session')
    .addTag('users', 'Gestion du profil utilisateur')
    .addTag('transactions', 'CRUD des transactions financières')
    .addTag('budgets', 'Gestion des budgets par catégorie')
    .addTag('statistics', 'Statistiques et rapports financiers')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3000;
  
  // Rediriger la racine vers la documentation Swagger pour le frame Hugging Face
  app.getHttpAdapter().get('/', (req, res) => res.redirect('/api/docs'));

  await app.listen(port, '0.0.0.0');
  console.log(`🚀 GestFina API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
