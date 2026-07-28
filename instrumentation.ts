export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcileOnBoot } = await import("./lib/runtime/reconcile");
  try {
    reconcileOnBoot();
  } catch (error) {
    console.error("[osu-gpt] boot reconcile failed:", error);
  }
}
