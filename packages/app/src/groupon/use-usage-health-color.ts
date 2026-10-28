// Added for Groupon Desk (fork of Paseo, Apache-2.0): the sidebar Usage icon's colour, green to red as the fullest limit fills.

import { useMemo } from "react";
import { useUsageHostId } from "@/usage/hosts";
import { useUsageHostReports } from "@/usage/queries";
import { fullestUsagePercent, usageHealthColor, type UsageHealthColor } from "./usage-health";

export function useUsageHealthColor(): UsageHealthColor | null {
  const reports = useUsageHostReports(useUsageHostId());
  return useMemo(() => usageHealthColor(fullestUsagePercent(reports)), [reports]);
}
