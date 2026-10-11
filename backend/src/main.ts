import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { JsonLogger } from './common/request-logger.js';
import { swaggerEnabled, useJsonLogs } from './config/runtime-flags.js';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import type { Env } from './config/env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  if (useJsonLogs({ NODE_ENV: config.get('NODE_ENV', { infer: true }), LOG_FORMAT: config.get('LOG_FORMAT', { infer: true }) })) {
    app.useLogger(new JsonLogger());
  }

  configureApp(app);
  app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }) });

  // The API documentation lists every route, so it is off in production unless SWAGGER_ENABLED=true.
  if (swaggerEnabled({ NODE_ENV: config.get('NODE_ENV', { infer: true }), SWAGGER_ENABLED: config.get('SWAGGER_ENABLED', { infer: true }) })) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Rove API')
      .setDescription('E-scooter rental platform API')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));
  }

  await app.listen(config.get('PORT', { infer: true }));
}
await bootstrap();
