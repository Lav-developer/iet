export const isProduction = process.env.NODE_ENV === "production";
export const isDevelopment = process.env.NODE_ENV === "development";

export type RuntimeConfig = {
  databaseUrl?: string;
  authSecret?: string;
  storageEndpoint?: string;
  storageBucket?: string;
  storageAccessKey?: string;
  storageSecretKey?: string;
  storagePublicBaseUrl?: string;
  siteUrl?: string;
};

function required(name: string, value: string | undefined, errors: string[]) {
  if (!value?.trim()) errors.push(name);
  return value?.trim();
}

export function getRuntimeConfig(): RuntimeConfig {
  const errors: string[] = [];
  const config: RuntimeConfig = {
    databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL, errors),
    authSecret: required("AUTH_SECRET", process.env.AUTH_SECRET, errors),
    storageEndpoint: required("STORAGE_ENDPOINT", process.env.STORAGE_ENDPOINT, errors),
    storageBucket: required("STORAGE_BUCKET", process.env.STORAGE_BUCKET, errors),
    storageAccessKey: required("STORAGE_ACCESS_KEY", process.env.STORAGE_ACCESS_KEY, errors),
    storageSecretKey: required("STORAGE_SECRET_KEY", process.env.STORAGE_SECRET_KEY, errors),
    storagePublicBaseUrl: process.env.STORAGE_PUBLIC_BASE_URL?.trim(),
    siteUrl: required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL, errors),
  };

  if (isProduction) {
    // Only report the length problem when a value is present; a missing value
    // is already listed once by `required()` above.
    if (config.authSecret && config.authSecret.length < 32) errors.push("AUTH_SECRET (minimum 32 characters)");
    if (config.siteUrl) {
      try {
        const url = new URL(config.siteUrl);
        if (url.protocol !== "https:") errors.push("NEXT_PUBLIC_SITE_URL (must use https in production)");
      } catch {
        errors.push("NEXT_PUBLIC_SITE_URL (must be a valid URL)");
      }
    }
    if (errors.length) throw new Error(`Production configuration is incomplete: ${errors.join(", ")}`);
  }

  return config;
}

export function assertProductionConfig() {
  if (isProduction) getRuntimeConfig();
}

export function demoAuthEnabled() {
  return isDevelopment && process.env.ALLOW_DEMO_AUTH === "true";
}

export function assertDemoAuthConfig() {
  const email = process.env.DEMO_ADMIN_EMAIL?.trim();
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Demo authentication requires DEMO_ADMIN_EMAIL and a DEMO_ADMIN_PASSWORD of at least 12 characters.");
  }
  return { email, password };
}
