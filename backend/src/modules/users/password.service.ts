import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

@Injectable()
export class PasswordService {
  // Verifying against a throwaway hash when the user doesn't exist keeps login timing similar
  // for known and unknown emails.
  private readonly dummyHash = hash(randomUUID());

  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string | null, password: string): Promise<boolean> {
    try {
      const ok = await verify(passwordHash ?? (await this.dummyHash), password);
      return passwordHash !== null && ok;
    } catch {
      return false;
    }
  }
}
