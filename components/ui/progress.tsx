import * as React from "react";
import { cn } from "@/lib/utils";

type ProgressProps = {
  value: number;
} & React.HTMLAttributes<HTMLDivElement>;

function Progress({ value, className, ...props }: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
      className={cn("ui-progress", className)}
      {...props}
    >
      <div className="ui-progress__bar" style={{ width: `${safeValue}%` }} />
    </div>
  );
}

export { Progress };
