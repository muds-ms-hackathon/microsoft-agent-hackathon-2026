import { roleLabels } from "../labels";
import type { OrgRole } from "../types";

export function RoleBadge({ role }: { role: OrgRole }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
      {roleLabels[role]}
    </span>
  );
}
