"use client";

import { useState } from "react";
import { createStaff } from "@/app/actions/admin";
import type { Role } from "@/lib/types";
import { ActionForm } from "./ActionForm";
import { CheckboxGroup, Field, FormGrid, SelectField } from "./Fields";

type StaffRole = Exclude<Role, "CUSTOMER">;

interface Props {
  /** Roles the signed-in person may create. A single role hides the picker. */
  roles: StaffRole[];
  cities: { id: string; name: string }[];
  stations: { id: string; name: string; cityName?: string }[];
}

const ROLE_LABEL: Record<StaffRole, string> = {
  STATION_EMPLOYEE: "Station employee",
  CITY_MANAGER: "City manager",
  SUPER_ADMIN: "Super admin",
};

const ROLE_HELP: Record<StaffRole, string> = {
  STATION_EMPLOYEE: "Hands over and takes back scooters at the stations you pick.",
  CITY_MANAGER: "Runs every station, scooter and employee in the cities you pick.",
  SUPER_ADMIN: "Full access to every city and station. No assignment needed.",
};

/** Create-staff form that only shows the assignment that fits the chosen role. */
export function StaffCreateForm({ roles, cities, stations }: Props) {
  const [role, setRole] = useState<StaffRole>(roles[0]);

  return (
    <ActionForm action={createStaff} submitLabel="Create account" resetOnSuccess className="space-y-6">
      <FormGrid>
        {roles.length > 1 ? (
          <SelectField
            wide
            label="Role"
            name="role"
            value={role}
            onChange={(v) => setRole(v as StaffRole)}
            options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
            hint={ROLE_HELP[role]}
          />
        ) : (
          <input type="hidden" name="role" value={roles[0]} />
        )}
        <Field label="Full name" name="fullName" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Phone" name="phone" type="tel" placeholder="+919876543210" hint="Optional." />
        <Field
          label="Temporary password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters. Share it securely."
        />

        {role === "STATION_EMPLOYEE" && (
          <CheckboxGroup
            wide
            label="Works at"
            name="stationIds"
            options={stations.map((s) => ({ value: s.id, label: s.name, hint: s.cityName }))}
            hint="Pick at least one station."
          />
        )}
        {role === "CITY_MANAGER" && (
          <CheckboxGroup
            wide
            label="Manages"
            name="cityIds"
            options={cities.map((c) => ({ value: c.id, label: c.name }))}
            hint="Pick at least one city."
          />
        )}
      </FormGrid>
    </ActionForm>
  );
}
