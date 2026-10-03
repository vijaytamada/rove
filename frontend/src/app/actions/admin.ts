"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { apiRequest } from "@/lib/api";
import { failure, num, optional, phone, text, valuesOf, type FormState } from "@/lib/form";
import { getAccessToken } from "@/lib/session";

type Method = "POST" | "PATCH" | "PUT" | "DELETE";

async function token() {
  const t = await getAccessToken();
  if (!t) redirect("/login");
  return t;
}

/** Form actions: call the API, return form state (shown by <ActionForm>). */
async function submit(
  method: Method,
  path: string,
  body: unknown,
  form: FormData,
  done: { message: string; revalidate: string[] },
): Promise<FormState> {
  const res = await apiRequest(path, { method, body, token: await token() });
  if (!res.ok) return { ...failure(res), values: valuesOf(form) };
  for (const p of done.revalidate) revalidatePath(p);
  return { ok: true, message: done.message };
}

/** Button actions: call the API; on failure return to the page with an error message. */
async function click(method: Method, path: string, body: unknown, page: string): Promise<void> {
  const res = await apiRequest(path, { method, body, token: await token() });
  if (!res.ok) redirect(`${page}?error=${encodeURIComponent(res.code)}`);
  revalidatePath(page);
}

// ---------------- Cities ----------------

export async function createCity(_prev: FormState, form: FormData): Promise<FormState> {
  return submit(
    "POST",
    "/cities",
    { name: text(form, "name"), state: text(form, "state"), timezone: optional(form, "timezone") },
    form,
    { message: "City added", revalidate: ["/admin/cities", "/admin"] },
  );
}

export async function updateCity(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  return submit(
    "PATCH",
    `/cities/${id}`,
    { name: text(form, "name"), state: text(form, "state"), timezone: optional(form, "timezone") },
    form,
    { message: "City saved", revalidate: ["/admin/cities"] },
  );
}

export async function setCityActive(id: string, isActive: boolean): Promise<void> {
  await click("PATCH", `/cities/${id}`, { isActive }, "/admin/cities");
}

// ---------------- Stations ----------------

function stationBody(form: FormData) {
  return {
    name: text(form, "name"),
    address: text(form, "address"),
    latitude: num(form, "latitude"),
    longitude: num(form, "longitude"),
    capacity: num(form, "capacity"),
    opensAt: optional(form, "opensAt"),
    closesAt: optional(form, "closesAt"),
  };
}

export async function createStation(_prev: FormState, form: FormData): Promise<FormState> {
  return submit("POST", "/stations", { cityId: text(form, "cityId"), ...stationBody(form) }, form, {
    message: "Station added",
    revalidate: ["/admin/stations", "/admin"],
  });
}

export async function updateStation(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  const body = stationBody(form);
  // An empty hours field means "always open": send explicit nulls so the API clears them.
  const hours = { opensAt: body.opensAt ?? null, closesAt: body.closesAt ?? null };
  return submit("PATCH", `/stations/${id}`, { ...body, ...hours, status: text(form, "status") }, form, {
    message: "Station saved",
    revalidate: ["/admin/stations", `/admin/stations/${id}`],
  });
}

export async function setStationStatus(id: string, status: "ACTIVE" | "INACTIVE"): Promise<void> {
  await click("PATCH", `/stations/${id}`, { status }, "/admin/stations");
}

// ---------------- Vehicle models ----------------

export async function createModel(_prev: FormState, form: FormData): Promise<FormState> {
  return submit(
    "POST",
    "/vehicle-models",
    {
      brand: text(form, "brand"),
      name: text(form, "name"),
      rangeKm: num(form, "rangeKm"),
      topSpeedKmh: num(form, "topSpeedKmh"),
      batteryCapacityWh: num(form, "batteryCapacityWh"),
    },
    form,
    { message: "Model added", revalidate: ["/admin/models", "/admin/fleet"] },
  );
}

export async function setModelActive(id: string, isActive: boolean): Promise<void> {
  await click("PATCH", `/vehicle-models/${id}`, { isActive }, "/admin/models");
}

// ---------------- Vehicles ----------------

export async function createVehicle(_prev: FormState, form: FormData): Promise<FormState> {
  return submit(
    "POST",
    "/vehicles",
    {
      modelId: text(form, "modelId"),
      stationId: text(form, "stationId"),
      code: text(form, "code"),
      registrationNumber: optional(form, "registrationNumber"),
      batteryPercent: num(form, "batteryPercent"),
      odometerKm: num(form, "odometerKm"),
    },
    form,
    { message: "Scooter added", revalidate: ["/admin/fleet", "/admin"] },
  );
}

export async function updateVehicle(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  return submit(
    "PATCH",
    `/vehicles/${id}`,
    {
      stationId: text(form, "stationId"),
      registrationNumber: optional(form, "registrationNumber"),
      batteryPercent: num(form, "batteryPercent"),
      odometerKm: num(form, "odometerKm"),
    },
    form,
    { message: "Scooter saved", revalidate: ["/admin/fleet", `/admin/fleet/${id}`] },
  );
}

/** Row action: `<form action={changeVehicleStatus}>` with hidden `id`, `status` and `page` fields. */
export async function changeVehicleStatus(form: FormData): Promise<void> {
  const page = text(form, "page") || "/admin/fleet";
  await click("PATCH", `/vehicles/${text(form, "id")}/status`, { status: text(form, "status") }, page);
  revalidatePath("/admin");
}

export async function retireVehicle(id: string): Promise<void> {
  await click("DELETE", `/vehicles/${id}`, undefined, "/admin/fleet");
  redirect("/admin/fleet");
}

// ---------------- Staff ----------------

/** City managers get city assignments, station employees get station assignments, admins none. */
function assignmentsFor(role: string, form: FormData) {
  const pick = (name: string) => form.getAll(name).map(String).filter(Boolean);
  if (role === "CITY_MANAGER") return pick("cityIds").map((cityId) => ({ cityId }));
  if (role === "STATION_EMPLOYEE") return pick("stationIds").map((stationId) => ({ stationId }));
  return [];
}

export async function createStaff(_prev: FormState, form: FormData): Promise<FormState> {
  const role = text(form, "role");
  const assignments = assignmentsFor(role, form);
  return submit(
    "POST",
    "/users",
    {
      email: text(form, "email"),
      password: String(form.get("password") ?? ""),
      fullName: text(form, "fullName"),
      phone: phone(form, "phone"),
      role,
      assignments,
    },
    form,
    { message: "Account created", revalidate: ["/admin/staff"] },
  );
}

export async function updateStaff(id: string, _prev: FormState, form: FormData): Promise<FormState> {
  return submit("PATCH", `/users/${id}`, { fullName: text(form, "fullName") }, form, {
    message: "Saved",
    revalidate: ["/admin/staff", `/admin/staff/${id}`],
  });
}

export async function setStaffAssignments(id: string, role: string, _prev: FormState, form: FormData): Promise<FormState> {
  return submit(
    "PUT",
    `/users/${id}/assignments`,
    { assignments: assignmentsFor(role, form) },
    form,
    { message: "Assignments saved", revalidate: ["/admin/staff", `/admin/staff/${id}`] },
  );
}

export async function setStaffStatus(id: string, status: "ACTIVE" | "DISABLED"): Promise<void> {
  await click("PATCH", `/users/${id}`, { status }, "/admin/staff");
}
