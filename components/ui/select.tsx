import * as React from "react";
import { cn } from "@/lib/utils";

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({ className, ...props }, ref) => {
  return <select ref={ref} className={cn("ui-select", className)} {...props} />;
});
Select.displayName = "Select";

export { Select };
