import { assertProductionConfig } from "@/lib/config";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") assertProductionConfig();
}
