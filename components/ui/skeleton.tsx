import * as React from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = React.HTMLAttributes<HTMLDivElement>;

const Skeleton = React.forwardRef<HTMLDivElement, SkeletonProps>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn("ui-skeleton", className)} {...props} />;
});
Skeleton.displayName = "Skeleton";

export { Skeleton };
