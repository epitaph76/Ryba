import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { apiEnvironment } from './app.config';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableShutdownHooks();

  await app.listen(apiEnvironment.API_PORT, '0.0.0.0');
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
