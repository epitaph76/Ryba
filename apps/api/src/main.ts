import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { apiEnvironment } from './app.config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/http-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    {
      logger: ['error', 'warn', 'log'],
    },
  );

  app.enableCors({
    origin:
      apiEnvironment.API_CORS_ORIGIN === '*'
        ? true
        : apiEnvironment.API_CORS_ORIGIN.split(',').map((origin) => origin.trim()),
    credentials: true,
  });

  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Ryba API')
    .setDescription('S-2 core domain and backend skeleton API')
    .setVersion('0.2.0')
    .addBearerAuth()
    .build();

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [],
  });

  SwaggerModule.setup('docs', app, swaggerDocument, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  app.enableShutdownHooks();

  await app.listen({
    port: apiEnvironment.API_PORT,
    host: '0.0.0.0',
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
