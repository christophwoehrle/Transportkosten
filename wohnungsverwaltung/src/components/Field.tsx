import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

let counter = 0;

/** Label + Eingabefeld als vertikale Gruppe. */
export function Field({
  label,
  children,
  hint,
  className,
  htmlFor,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
  htmlFor?: string;
}) {
  const id = React.useMemo(() => htmlFor ?? `f${++counter}`, [htmlFor]);
  // Kindelement automatisch mit id verknüpfen, falls möglich.
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement, { id })
    : children;
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {child}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Zweispaltiges Grid für Formularfelder (auf Mobil einspaltig). */
export function FieldGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>{children}</div>
  );
}
