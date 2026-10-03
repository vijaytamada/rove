import { validateAssignments } from './users.service.js';

const city = (cityId: string) => ({ cityId });
const station = (stationId: string) => ({ stationId });

describe('validateAssignments', () => {
  it('accepts matching assignment kinds', () => {
    expect(validateAssignments('CITY_MANAGER', [city('c1'), city('c2')])).toHaveLength(2);
    expect(validateAssignments('STATION_EMPLOYEE', [station('s1')])).toHaveLength(1);
    expect(validateAssignments('SUPER_ADMIN', [])).toEqual([]);
    expect(validateAssignments('CUSTOMER', [])).toEqual([]);
  });

  it('removes duplicates', () => {
    expect(validateAssignments('CITY_MANAGER', [city('c1'), city('c1')])).toEqual([city('c1')]);
  });

  it('rejects the wrong kind for a role', () => {
    expect(() => validateAssignments('CITY_MANAGER', [station('s1')])).toThrow();
    expect(() => validateAssignments('STATION_EMPLOYEE', [city('c1')])).toThrow();
  });

  it('rejects assignments for roles that cannot have them', () => {
    expect(() => validateAssignments('SUPER_ADMIN', [city('c1')])).toThrow();
    expect(() => validateAssignments('CUSTOMER', [station('s1')])).toThrow();
  });

  it('requires exactly one of cityId or stationId', () => {
    expect(() => validateAssignments('CITY_MANAGER', [{}])).toThrow();
    expect(() => validateAssignments('CITY_MANAGER', [{ cityId: 'c1', stationId: 's1' }])).toThrow();
  });
});
