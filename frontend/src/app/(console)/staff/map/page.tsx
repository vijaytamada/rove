import { LiveFleetMap } from "@/components/fleet/LiveFleetMap";
import { PageHeader } from "@/components/admin/ui";
import { requireRole } from "@/lib/dal";

export const metadata = { title: "Live map" };
export const dynamic = "force-dynamic";

export default async function LiveMapPage() {
  await requireRole("/staff/map", "STATION_EMPLOYEE", "CITY_MANAGER", "SUPER_ADMIN");
  return (
    <>
      <PageHeader
        title="Live map"
        description="Where the scooters are right now. Stations are the white squares; click a scooter on a ride to see its path."
      />
      <LiveFleetMap />
    </>
  );
}
