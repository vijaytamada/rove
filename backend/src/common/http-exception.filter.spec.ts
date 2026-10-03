import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { AppException } from './app-exception.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function run(exception: unknown) {
  let captured: { status: number; body: Record<string, unknown> } | undefined;
  const res = {
    status(status: number) {
      return { json: (body: Record<string, unknown>) => void (captured = { status, body }) };
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return captured!;
}

describe('HttpExceptionFilter', () => {
  it('formats AppException with its stable code', () => {
    const r = run(new AppException(409, 'EMAIL_TAKEN', 'Taken.'));
    expect(r).toEqual({ status: 409, body: { statusCode: 409, code: 'EMAIL_TAKEN', message: 'Taken.' } });
  });

  it('formats validation errors with details', () => {
    const r = run(new BadRequestException({ message: ['email must be an email'], error: 'Bad Request', statusCode: 400 }));
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Validation failed', details: ['email must be an email'] });
  });

  it('maps oversized bodies from the body parser to 413', () => {
    const r = run(Object.assign(new Error('request entity too large'), { status: 413, type: 'entity.too.large' }));
    expect(r.status).toBe(413);
    expect(r.body.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('maps invalid JSON to 400 without leaking parser details', () => {
    const r = run(Object.assign(new SyntaxError('Unexpected token } in JSON at position 5'), { status: 400, type: 'entity.parse.failed' }));
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).not.toContain('position');
  });

  it('scrubs raw JSON parser text from 400 responses', () => {
    const r = run(new BadRequestException("Expected property name or '}' in JSON at position 1 (line 1 column 2)"));
    expect(r.status).toBe(400);
    expect(r.body.message).toBe('The request body is not valid JSON.');
  });

  it('hides unexpected errors behind a generic 500', () => {
    const r = run(new Error('database password is hunter2'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('hunter2');
    expect(r.body.code).toBe('INTERNAL_ERROR');
  });
});
