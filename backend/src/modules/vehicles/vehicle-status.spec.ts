import { assertManualStatusChange } from './vehicle-status.js';

describe('assertManualStatusChange', () => {
  it('lets managers and admins move between manual statuses', () => {
    for (const role of ['SUPER_ADMIN', 'CITY_MANAGER'] as const) {
      expect(() => assertManualStatusChange(role, 'AVAILABLE', 'MAINTENANCE')).not.toThrow();
      expect(() => assertManualStatusChange(role, 'MAINTENANCE', 'AVAILABLE')).not.toThrow();
      expect(() => assertManualStatusChange(role, 'AVAILABLE', 'OFFLINE')).not.toThrow();
      expect(() => assertManualStatusChange(role, 'OFFLINE', 'AVAILABLE')).not.toThrow();
    }
  });

  it('never lets anyone set system-controlled statuses', () => {
    for (const to of ['RESERVED', 'IN_RIDE'] as const) {
      expect(() => assertManualStatusChange('SUPER_ADMIN', 'AVAILABLE', to)).toThrowError(
        expect.objectContaining({ code: 'INVALID_STATUS_CHANGE' }),
      );
    }
  });

  it('never changes a vehicle that is reserved or in a ride', () => {
    for (const from of ['RESERVED', 'IN_RIDE'] as const) {
      expect(() => assertManualStatusChange('SUPER_ADMIN', from, 'MAINTENANCE')).toThrowError(
        expect.objectContaining({ code: 'VEHICLE_BUSY' }),
      );
    }
  });

  it('lets station employees only flag maintenance', () => {
    expect(() => assertManualStatusChange('STATION_EMPLOYEE', 'AVAILABLE', 'MAINTENANCE')).not.toThrow();
    expect(() => assertManualStatusChange('STATION_EMPLOYEE', 'MAINTENANCE', 'AVAILABLE')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN_ROLE' }),
    );
    expect(() => assertManualStatusChange('STATION_EMPLOYEE', 'AVAILABLE', 'OFFLINE')).toThrowError(
      expect.objectContaining({ code: 'FORBIDDEN_ROLE' }),
    );
  });
});
