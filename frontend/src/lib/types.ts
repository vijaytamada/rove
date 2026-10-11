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
  /** Tries left if the next one does not work out. 0 = contact support. */
  attemptsLeft: number;
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
  /** Pickup PIN, only until the scooter is handed over. */
  pin: string | null;
  vehicle: { id: string; code: string; model: VehicleModelView };
  station: StationSummary;
  payment: { status: "PENDING" | "SUCCEEDED" | "FAILED"; chargeAmount: number; paidAt: string | null } | null;
  refundedAmount: number;
  /** The final bill, once the scooter has been returned. */
  settlement: SettlementView | null;
  /** What cancelling right now would do. */
  cancellation: { allowed: boolean; refundAmount: number; retainedAmount: number };
  /** The ride itself, once the scooter was handed over. */
  rental: { startedAt: string; endedAt: string | null; distanceKm: number | null; returnStationName: string | null } | null;
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

// ---- Station desk (Phase 5) ----

export interface DamageView {
  id: string;
  phase: "PICKUP" | "RETURN";
  description: string;
  severity: "MINOR" | "MODERATE" | "MAJOR";
  /** Flat charge in paise, taken from the deposit on the final bill. */
  feeAmount: number;
}

export interface RentalDetail {
  startedAt: string;
  endedAt: string | null;
  startOdometerKm: number;
  endOdometerKm: number | null;
  distanceKm: number | null;
  startBatteryPercent: number;
  endBatteryPercent: number | null;
  pickupEmployee: string;
  returnEmployee: string | null;
  returnStation: { id: string; name: string } | null;
  swapReason: string | null;
  damages: DamageView[];
}

export interface Allowed {
  allowed: boolean;
  reason?: string;
}

export type SettlementStatus = "REFUND_PENDING" | "REFUNDED" | "OUTSTANDING" | "CLEARED" | "NO_ACTION";

/** The final bill of a ride: charges taken from the deposit, then a refund or an amount owed. */
export interface SettlementView {
  id: string;
  status: SettlementStatus;
  depositHeld: number;
  totalCharges: number;
  refundAmount: number;
  outstandingAmount: number;
  lineItems: { type: "EXTRA_KM" | "LATE_FEE" | "DAMAGE"; description: string; quantity: number; unitAmount: number; amount: number }[];
  settledAt: string | null;
  clearedAt: string | null;
  payable: boolean;
}

export interface StaffSettlementView extends SettlementView {
  booking: {
    id: string;
    code: string;
    status: BookingStatus;
    customer: { id: string; fullName: string; phone: string | null };
    vehicleCode: string;
    stationName: string;
    timezone: string;
    returnStationName: string | null;
    returnedAt: string | null;
  };
}

/** A booking as the station sees it. Never contains the pickup PIN. */
export interface StaffBookingView {
  id: string;
  code: string;
  status: BookingStatus;
  startAt: string;
  endAt: string;
  hours: number;
  createdAt: string;
  rentalAmount: number;
  depositAmount: number;
  totalAmount: number;
  refundedAmount: number;
  /** The final bill, once the scooter has been returned. */
  settlement: SettlementView | null;
  customer: { id: string; fullName: string; phone: string | null };
  vehicle: {
    id: string;
    code: string;
    model: VehicleModelView;
    odometerKm: number;
    batteryPercent: number | null;
    status: VehicleStatus;
  };
  station: StationSummary;
  rental: RentalDetail | null;
  pickupOpensAt: string;
  noShowFrom: string;
  actions: { pickup: Allowed; return: Allowed; noShow: Allowed };
  returnStations: { id: string; name: string }[];
  swapOptions: { id: string; code: string; batteryPercent: number | null }[];
}

export type DeskTab = "pickups" | "rides" | "past";

// ---- Dashboards (read-only numbers for each role's home) ----
export type DashboardRange = "1d" | "7d" | "30d";

export interface DashboardMetrics {
  window: { key: DashboardRange; from: string; to: string; hours: number };
  fleet: { total: number; available: number; inRide: number; maintenance: number; offline: number };
  utilizationPercent: number;
  activity: { newBookings: number; ridesStarted: number; ridesCompleted: number; cancellations: number; noShows: number };
  money: { collected: number; refunded: number; net: number };
  now: {
    waitingPickups: number;
    ridesOut: number;
    overdueRides: number;
    depositsHeld: number;
    owed: { count: number; amount: number };
    refundsPending: { count: number; amount: number };
  };
}

export interface DashboardRow {
  id: string;
  name: string;
  fleet: DashboardMetrics["fleet"];
  utilizationPercent: number;
  money: DashboardMetrics["money"];
  now: Pick<DashboardMetrics["now"], "waitingPickups" | "ridesOut" | "overdueRides" | "owed" | "refundsPending">;
}

export interface AdminDashboard extends DashboardMetrics {
  cities: (DashboardRow & { stations: number })[];
}

export interface CityDashboard extends DashboardMetrics {
  city: { id: string; name: string; timezone: string };
  stations: DashboardRow[];
}

export interface QueueItem {
  id: string;
  code: string;
  customerName: string;
  vehicleCode: string;
  startAt: string;
  endAt: string;
  overdue: boolean;
}

export interface StationDashboard extends DashboardMetrics {
  station: { id: string; name: string; cityId: string; cityName: string; timezone: string };
  queue: { pickups: QueueItem[]; rides: QueueItem[] };
}

export interface CustomerDashboard {
  active: BookingView | null;
  upcoming: BookingView | null;
  recent: BookingView[];
  owed: { bookingId: string; amount: number } | null;
  stats: { rides: number; distanceKm: number };
}

export type NotificationType =
  | "BOOKING_CONFIRMED"
  | "BOOKING_CANCELLED"
  | "BOOKING_EXPIRED"
  | "PICKUP_REMINDER"
  | "RIDE_STARTED"
  | "RETURN_REMINDER"
  | "RETURN_OVERDUE"
  | "RIDE_COMPLETED"
  | "REFUND_SENT"
  | "PAYMENT_RECEIVED"
  | "NO_SHOW"
  | "KYC_VERIFIED"
  | "KYC_REJECTED";

export interface NotificationView {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** The booking this is about, to link to it. */
  bookingId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface AuditEntryView {
  id: string;
  createdAt: string;
  /** A stable code such as BOOKING_PICKUP; unknown ones are "METHOD /route". */
  action: string;
  entityType: string | null;
  entityId: string | null;
  route: string | null;
  details: unknown;
  /** Null when the system acted (a provider webhook). */
  actor: { id: string; fullName: string; role: Role } | null;
}

export interface LiveVehicle {
  vehicleId: string;
  code: string;
  status: VehicleStatus;
  model: string;
  batteryPercent: number | null;
  station: { id: string; name: string } | null;
  /** The ride it is out on (never the rider). */
  booking: { id: string; code: string } | null;
  position: {
    latitude: number;
    longitude: number;
    speedKmh: number;
    ignition: boolean;
    recordedAt: string;
    /** The tracker has gone quiet for longer than it should. */
    stale: boolean;
    source: "TRACKER" | "STATION";
  } | null;
}

export interface LiveFleet {
  generatedAt: string;
  stations: { id: string; name: string; cityId: string; latitude: number; longitude: number }[];
  vehicles: LiveVehicle[];
}

export interface TelemetryTrail {
  points: { recordedAt: string; latitude: number; longitude: number; speedKmh: number; batteryPercent: number; odometerKm: number; ignition: boolean }[];
}
