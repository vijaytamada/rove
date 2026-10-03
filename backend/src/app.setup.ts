import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { HttpExceptionFilter } from './common/http-exception.filter.js';

/** App-wide HTTP setup shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
