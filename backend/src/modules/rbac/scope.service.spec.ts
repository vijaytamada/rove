import { ScopeService } from './scope.service.js';
import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { Role } from '../../generated/prisma/client.js';

const CITY_A = 'a0000000-0000-4000-8000-000000000001';
const CITY_B = 'b0000000-0000-4000-8000-000000000002';
const STATION_1 = 'c0000000-0000-4000-8000-000000000011';
const STATION_2 = 'c0000000-0000-4000-8000-000000000012';

function service(assignments: { cityId?: string; stationId?: string }[]) {
  const prisma = {
    staffAssignment: {
      findMany: async () => assignments.map((a) => ({ cityId: a.cityId ?? null, stationId: a.stationId ?? null })),
    },
  } as unknown as PrismaService;
  return new ScopeService(prisma);
}
const user = (role: Role) => ({ id: 'u1', role });

describe('ScopeService', () => {
  it('lets super admins access any city or station', async () => {
    const s = service([]);
    await expect(s.assertCityAccess(user('SUPER_ADMIN'), CITY_A)).resolves.toBeUndefined();
    await expect(s.assertStationAccess(user('SUPER_ADMIN'), { stationId: STATION_1, cityId: CITY_B })).resolves.toBeUndefined();
  });

  it('limits city managers to their cities', async () => {
    const s = service([{ cityId: CITY_A }]);
    await expect(s.assertCityAccess(user('CITY_MANAGER'), CITY_A)).resolves.toBeUndefined();
    await expect(s.assertCityAccess(user('CITY_MANAGER'), CITY_B)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('gives city managers access to every station in their cities only', async () => {
    const s = service([{ cityId: CITY_A }]);
    await expect(s.assertStationAccess(user('CITY_MANAGER'), { stationId: STATION_1, cityId: CITY_A })).resolves.toBeUndefined();
    await expect(s.assertStationAccess(user('CITY_MANAGER'), { stationId: STATION_1, cityId: CITY_B })).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
  });

  it('limits station employees to their stations and gives them no city access', async () => {
    const s = service([{ stationId: STATION_1 }]);
    await expect(s.assertStationAccess(user('STATION_EMPLOYEE'), { stationId: STATION_1, cityId: CITY_A })).resolves.toBeUndefined();
    await expect(s.assertStationAccess(user('STATION_EMPLOYEE'), { stationId: STATION_2, cityId: CITY_A })).rejects.toMatchObject({
      code: 'FORBIDDEN_SCOPE',
    });
    await expect(s.assertCityAccess(user('STATION_EMPLOYEE'), CITY_A)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });

  it('gives customers no staff scope', async () => {
    const s = service([{ cityId: CITY_A }]);
    expect(await s.getScope(user('CUSTOMER'))).toEqual({ unrestricted: false, cityIds: [], stationIds: [] });
    await expect(s.assertCityAccess(user('CUSTOMER'), CITY_A)).rejects.toMatchObject({ code: 'FORBIDDEN_SCOPE' });
  });
});
