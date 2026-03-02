"use client";

import { Toaster as SonnerToaster, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return <SonnerToaster theme="dark" richColors closeButton position="top-right" {...props} />;
}
