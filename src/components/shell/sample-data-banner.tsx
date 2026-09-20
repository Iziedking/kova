import { FlaskConical } from "lucide-react";
import { isFixtureMode } from "@/services";

/**
 * Shown on every page whenever fixtures are the data source, so sample values can
 * never be mistaken for live ones. Renders nothing against real services.
 */
export function SampleDataBanner() {
  if (!isFixtureMode()) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-1.5 text-center text-[12px] font-medium text-warning"
    >
      <FlaskConical size={13} aria-hidden="true" />
      Sample data for development — markets, players, tables and trades are not live.
    </div>
  );
}
