import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { OtpProvider, OtpPurpose } from './otp.provider.js';

/** Development-only provider: no SMS is sent and the code is always 123456. */
export const MOCK_OTP_CODE = '123456';

@Injectable()
export class MockOtpProvider implements OtpProvider {
  private readonly logger = new Logger('MockOtpProvider');

  constructor() {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MockOtpProvider must not be used in production');
    }
  }

  async send(input: { phone: string; purpose: OtpPurpose }) {
    this.logger.log(`Mock OTP for ${input.phone} (${input.purpose}): ${MOCK_OTP_CODE}`);
    return { challengeId: randomUUID() };
  }

  async verify(input: { challengeId: string; code: string }) {
    return input.code === MOCK_OTP_CODE;
  }
}
