export type Role = "SUPER_ADMIN" | "CITY_MANAGER" | "STATION_EMPLOYEE" | "CUSTOMER";

export interface UserView {
  id: string;
  email: string;
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
