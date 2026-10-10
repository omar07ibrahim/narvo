export const dynamic = "force-dynamic";

import { EmployeeHub } from "./_components/hub";
import { getStats, loadEmployees, loadRequests } from "./_lib/server";

export default function Page() {
  return <EmployeeHub employees={loadEmployees()} initialRequests={loadRequests()} initialStats={getStats()} />;
}
