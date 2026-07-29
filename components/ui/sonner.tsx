"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

/**
 * Unstyled sonner shell; the look comes from .toast* rules in globals.css so
 * notifications share the app's tokens (surface, hairline border, 2px radius,
 * mono status label) and follow the light/dark theme.
 */
export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      position="top-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast: "toast",
          title: "toast__title",
          description: "toast__description",
          error: "toast--error",
          success: "toast--success",
        },
      }}
      {...props}
    />
  );
}
