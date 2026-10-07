// Seeds local development data. Idempotent: safe to run repeatedly (existing rows are left alone).
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
  throw new Error('Refusing to seed development data in production');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: required('DATABASE_URL') }),
});

async function upsertUser(input: {
  email: string;
  password: string;
  fullName: string;
  role: Role;
  phone?: string;
  cityIds?: string[];
  stationIds?: string[];
}) {
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
      assignments: {
        create: [
          ...(input.cityIds ?? []).map((cityId) => ({ cityId })),
          ...(input.stationIds ?? []).map((stationId) => ({ stationId })),
        ],
      },
    },
  });
  console.log(`+ created ${input.role} ${email}`);
}

// ---- Demo network ----
const CITIES = [
  {
    key: 'blr',
    name: 'Bengaluru',
    state: 'Karnataka',
    stations: [
      { key: 'indiranagar', name: 'Indiranagar', address: '100 Feet Rd, Indiranagar, Bengaluru', latitude: 12.9784, longitude: 77.6408, capacity: 12 },
      { key: 'koramangala', name: 'Koramangala', address: '80 Feet Rd, Koramangala, Bengaluru', latitude: 12.9352, longitude: 77.6245, capacity: 10 },
      { key: 'mg-road', name: 'MG Road', address: 'MG Road Metro, Bengaluru', latitude: 12.9756, longitude: 77.6066, capacity: 10 },
    ],
  },
  {
    key: 'hyd',
    name: 'Hyderabad',
    state: 'Telangana',
    stations: [
      { key: 'hitech-city', name: 'HITEC City', address: 'Cyber Towers, HITEC City, Hyderabad', latitude: 17.4435, longitude: 78.3772, capacity: 12 },
      { key: 'banjara-hills', name: 'Banjara Hills', address: 'Road No. 12, Banjara Hills, Hyderabad', latitude: 17.4126, longitude: 78.4482, capacity: 8 },
    ],
  },
] as const;

// Fictional brand so the demo data makes no claims about real products.
const MODELS = [
  { brand: 'Voltra', name: 'V1 Lite', rangeKm: 60, topSpeedKmh: 25, batteryCapacityWh: 1200 },
  { brand: 'Voltra', name: 'V2', rangeKm: 90, topSpeedKmh: 45, batteryCapacityWh: 2400 },
  { brand: 'Voltra', name: 'V3 Pro', rangeKm: 120, topSpeedKmh: 60, batteryCapacityWh: 3600 },
] as const;

// Default pricing, in the same order as MODELS. Amounts are paise (4900 = Rs 49). The day rate caps the price of long rentals.
const PLANS = [
  { hourlyRateAmount: 4900, dailyRateAmount: 29900, includedKmPerHour: 10, extraKmRateAmount: 600, graceMinutes: 15, lateFeePerHourAmount: 9900, depositAmount: 100000 },
  { hourlyRateAmount: 6900, dailyRateAmount: 39900, includedKmPerHour: 12, extraKmRateAmount: 700, graceMinutes: 15, lateFeePerHourAmount: 12900, depositAmount: 150000 },
  { hourlyRateAmount: 9900, dailyRateAmount: 59900, includedKmPerHour: 15, extraKmRateAmount: 900, graceMinutes: 15, lateFeePerHourAmount: 17900, depositAmount: 200000 },
] as const;

// How many scooters (and of which model) each station gets.
const FLEET: Record<string, { model: number; battery: number; status?: 'MAINTENANCE' }[]> = {
  indiranagar: [{ model: 1, battery: 92 }, { model: 2, battery: 85 }, { model: 0, battery: 78 }],
  koramangala: [{ model: 1, battery: 88 }, { model: 0, battery: 64 }, { model: 2, battery: 97, status: 'MAINTENANCE' }],
  'mg-road': [{ model: 1, battery: 71 }, { model: 0, battery: 83 }],
  'hitech-city': [{ model: 2, battery: 90 }, { model: 1, battery: 76 }],
  'banjara-hills': [{ model: 1, battery: 81 }, { model: 0, battery: 69 }],
};

try {
  const adminPassword = required('SEED_ADMIN_PASSWORD');
  const staffPassword = required('SEED_STAFF_PASSWORD');

  await upsertUser({ email: required('SEED_ADMIN_EMAIL'), password: adminPassword, fullName: 'Rove Admin', role: 'SUPER_ADMIN' });
  // Customers sign in with their phone number (mock code 123456 in development): no email or password.
  const customerPhone = required('SEED_CUSTOMER_PHONE');
  if (await prisma.user.findUnique({ where: { phone: customerPhone } })) {
    console.log(`= CUSTOMER ${customerPhone} already exists`);
  } else {
    await prisma.user.create({
      data: { phone: customerPhone, fullName: 'Demo Customer', role: 'CUSTOMER', phoneVerifiedAt: new Date() },
    });
    console.log(`+ created CUSTOMER ${customerPhone}`);
  }

  const modelIds: string[] = [];
  for (const m of MODELS) {
    const model = await prisma.vehicleModel.upsert({
      where: { brand_name: { brand: m.brand, name: m.name } },
      update: {},
      create: { ...m },
    });
    modelIds.push(model.id);
  }

  // One default plan per model (amounts in paise): the same price in every city until a city gets its own plan.
  for (const [i, plan] of PLANS.entries()) {
    const modelId = modelIds[i];
    if (await prisma.pricingPlan.findFirst({ where: { modelId, cityId: null } })) continue;
    await prisma.pricingPlan.create({ data: { modelId, ...plan } });
    console.log(`+ created pricing plan for ${MODELS[i].name}`);
  }

  for (const c of CITIES) {
    const city = await prisma.city.upsert({
      where: { name_state: { name: c.name, state: c.state } },
      update: {},
      create: { name: c.name, state: c.state },
    });
    await upsertUser({
      email: `manager.${c.key}@rove.local`,
      password: staffPassword,
      fullName: `${c.name} Manager`,
      role: 'CITY_MANAGER',
      cityIds: [city.id],
    });

    let vehicleNumber = 0;
    for (const s of c.stations) {
      const station = await prisma.station.upsert({
        where: { cityId_name: { cityId: city.id, name: s.name } },
        update: {},
        create: { cityId: city.id, name: s.name, address: s.address, latitude: s.latitude, longitude: s.longitude, capacity: s.capacity, opensAt: '06:00', closesAt: '22:00' },
      });
      await upsertUser({
        email: `employee.${s.key}@rove.local`,
        password: staffPassword,
        fullName: `${s.name} Employee`,
        role: 'STATION_EMPLOYEE',
        stationIds: [station.id],
      });

      for (const v of FLEET[s.key] ?? []) {
        vehicleNumber += 1;
        const code = `${c.key.toUpperCase()}-${String(vehicleNumber).padStart(3, '0')}`;
        await prisma.vehicle.upsert({
          where: { code },
          update: {},
          create: {
            code,
            modelId: modelIds[v.model],
            stationId: station.id,
            batteryPercent: v.battery,
            odometerKm: 120 + vehicleNumber * 37,
            status: v.status ?? 'AVAILABLE',
          },
        });
      }
    }
  }
  console.log(`Seeded ${CITIES.length} cities, ${CITIES.reduce((n, c) => n + c.stations.length, 0)} stations, ${MODELS.length} models.`);
} finally {
  await prisma.$disconnect();
}
