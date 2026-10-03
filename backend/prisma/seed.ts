// Seeds local development users. Idempotent: safe to run repeatedly.
// Credentials come from the root .env (see .env.example). Never run against production.
import { config } from 'dotenv';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Role } from '../src/generated/prisma/client.js';

config({ path: ['.env', '../.env'], quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to seed development users in production');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
});

async function upsertUser(input: { email: string; password: string; fullName: string; role: Role; phone?: string }) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`= ${input.role} ${email} already exists`);
    return;
  }
  await prisma.user.create({
    data: {
      email,
      passwordHash: await hash(input.password),
      fullName: input.fullName,
      role: input.role,
      phone: input.phone ?? null,
    },
  });
  console.log(`+ created ${input.role} ${email}`);
}

try {
  await upsertUser({
    email: required('SEED_ADMIN_EMAIL'),
    password: required('SEED_ADMIN_PASSWORD'),
    fullName: 'Rove Admin',
    role: 'SUPER_ADMIN',
  });
  await upsertUser({
    email: required('SEED_CUSTOMER_EMAIL'),
    password: required('SEED_CUSTOMER_PASSWORD'),
    fullName: 'Demo Customer',
    role: 'CUSTOMER',
    phone: '+919000000001',
  });
  // Cities, stations and staff are seeded in Phase 3.
} finally {
  await prisma.$disconnect();
}
