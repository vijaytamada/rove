export type Role = "SUPER_ADMIN" | "CITY_MANAGER" | "STATION_EMPLOYEE" | "CUSTOMER";

export interface UserView {
  id: string;
  /** Staff always have one; customers sign in with their phone and may have none. */
  email: string | null;
  phone: string | null;
  fullName: string;
  role: Role;
  status: "ACTIVE" | "DISABLED";
  phoneVerified: boolean;
  createdAt: string;
  scope?: { cityIds: string[]; stationIds: string[] };
}

export interface AuthResult {
  user: UserView;
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
}

/** Response of `POST /auth/phone/verify`: signed in, or a new number that still needs a name. */
export type PhoneVerifyResult =
  | ({ status: "SIGNED_IN" } & AuthResult)
  | { status: "NEEDS_NAME"; signupToken: string };

export interface CodeSent {
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface CityView {
  id: string;
  name: string;
  state: string;
  timezone: string;
  isActive: boolean;
}

export interface StationView {
  id: string;
  cityId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  capacity: number;
  opensAt: string | null;
  closesAt: string | null;
  status: "ACTIVE" | "INACTIVE";
  /** Scooters currently available to rent here. */
  availableVehicles: number;
}

export interface VehicleModelView {
  id: string;
  type: "SCOOTER";
  brand: string;
  name: string;
  rangeKm: number;
  topSpeedKmh: number;
  batteryCapacityWh: number | null;
  isActive: boolean;
}

export type VehicleStatus = "AVAILABLE" | "RESERVED" | "IN_RIDE" | "MAINTENANCE" | "OFFLINE";

export interface VehiclePublicView {
  id: string;
  code: string;
  status: VehicleStatus;
  batteryPercent: number | null;
  model: VehicleModelView;
}

export interface VehicleManageView extends VehiclePublicView {
  registrationNumber: string | null;
  odometerKm: number;
  station: { id: string; name: string; cityId: string } | null;
  createdAt: string;
}
