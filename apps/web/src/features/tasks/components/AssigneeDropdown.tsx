import { useOrganizationMembers } from "@/features/organizations/hooks/useOrganizationMembers";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

// クリックで開くドロップダウン形式の担当者選択。
// AssigneePicker（常時表示チップ形式）と異なり、コンパクトなボタン1つに収まる。
export function AssigneeDropdown({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: members = [], isLoading } =
    useOrganizationMembers(organizationId);

  const selectedNames = members
    .filter((m) => value.includes(m.userId))
    .map((m) => m.displayName);

  const toggle = (userId: string) => {
    onChange(
      value.includes(userId)
        ? value.filter((id) => id !== userId)
        : [...value, userId],
    );
  };

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md border border-border/60 bg-card hover:bg-accent min-w-[140px] text-left"
      >
        <UserIcon size={12} className="text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-foreground">
          {selectedNames.length > 0
            ? selectedNames.join(", ")
            : "担当者を選択"}
        </span>
        <ChevronDown size={12} className="text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-10 bg-card border border-border rounded-md shadow-md min-w-[180px] py-1">
          {isLoading ? (
            <p className="text-xs text-muted-foreground px-3 py-2">
              読み込み中...
            </p>
          ) : members.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3 py-2">
              メンバーがいません
            </p>
          ) : (
            members.map((m) => {
              const checked = value.includes(m.userId);
              return (
                <button
                  key={m.userId}
                  type="button"
                  onClick={() => toggle(m.userId)}
                  className="w-full text-left text-xs px-3 py-2 hover:bg-accent flex items-center gap-2"
                >
                  <span
                    className={cn(
                      "w-3.5 h-3.5 rounded-sm border shrink-0 flex items-center justify-center",
                      checked
                        ? "bg-foreground border-foreground"
                        : "border-border",
                    )}
                  >
                    {checked && (
                      <Check size={10} className="text-background" />
                    )}
                  </span>
                  <span className={cn(checked && "font-medium")}>
                    {m.displayName}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
