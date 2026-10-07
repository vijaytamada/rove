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
  /** Inside opening hours right now (city time). */
  openNow: boolean;
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

// ---- Pricing, KYC and bookings (Phase 4). Money is integer paise; only lib/format.ts turns it into text. ----

export interface PricingView {
  planId: string;
  hourlyRateAmount: number;
  /** When set, a long rental never costs more than this. */
  dailyRateAmount: number | null;
  includedKmPerHour: number;
  extraKmRateAmount: number;
  graceMinutes: number;
  lateFeePerHourAmount: number;
  depositAmount: number;
}

/** A scooter on a public list: the public view plus the price here (null = cannot be booked yet). */
export interface VehicleBrowseView extends VehiclePublicView {
  pricing: PricingView | null;
}

export interface StationSummary {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  opensAt: string | null;
  closesAt: string | null;
  cityName: string;
  /** IANA time zone of the city. Times are shown in it. */
  timezone: string;
}

export interface PublicVehicleDetail {
  vehicle: VehicleBrowseView;
  station: StationSummary;
}

export interface QuoteView {
  hours: number;
  rentalAmount: number;
  depositAmount: number;
  totalAmount: number;
  includedKm: number;
  vehicle: { id: string; code: string; batteryPercent: number | null; model: VehicleModelView };
  station: StationSummary;
  startAt: string;
  endAt: string;
  pricing: PricingView;
  holdMinutes: number;
}

export type KycStatus = "NOT_STARTED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface KycView {
  status: KycStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
}

export type BookingStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "IN_RIDE"
  | "RETURNED"
  | "SETTLED"
  | "CANCELLED"
  | "EXPIRED"
  | "NO_SHOW";

export type BookingTab = "active" | "upcoming" | "past";

export interface BookingView {
  id: string;
  code: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  hours: number;
  holdExpiresAt: string | null;
  confirmedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  rentalAmount: number;
  depositAmount: number;
  totalAmount: number;
  pricing: PricingView;
  includedKm: number;
  /** Pickup PIN, only while confirmed or in progress. */
  pin: string | null;
  vehicle: { id: string; code: string; model: VehicleModelView };
  station: StationSummary;
  payment: { status: "PENDING" | "SUCCEEDED" | "FAILED"; chargeAmount: number; paidAt: string | null } | null;
  refundedAmount: number;
  /** What cancelling right now would do. */
  cancellation: { allowed: boolean; refundAmount: number; retainedAmount: number };
}

export interface PricingPlanView {
  id: string;
  modelId: string;
  modelName: string;
  cityId: string | null;
  cityName: string | null;
  isActive: boolean;
  updatedAt: string;
  hourlyRateAmount: number;
  dailyRateAmount: number | null;
  includedKmPerHour: number;
  extraKmRateAmount: number;
  graceMinutes: number;
  lateFeePerHourAmount: number;
  depositAmount: number;
}
