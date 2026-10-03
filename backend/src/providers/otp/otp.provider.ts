export const OTP_PROVIDER = Symbol('OTP_PROVIDER');

export type OtpPurpose = 'PHONE_VERIFICATION';

/**
 * One-time-password delivery/verification. Expiry, retry limits and resend rules live in
 * OtpService (provider-independent); the provider only sends codes and checks them.
 */
export interface OtpProvider {
  send(input: { phone: string; purpose: OtpPurpose }): Promise<{ challengeId: string }>;
  verify(input: { challengeId: string; code: string }): Promise<boolean>;
}
