import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("ui-badge", {
  variants: {
    variant: {
      neutral: "ui-badge--neutral",
      success: "ui-badge--success",
      warning: "ui-badge--warning",
      danger: "ui-badge--danger",
      info: "ui-badge--info",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
});

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
