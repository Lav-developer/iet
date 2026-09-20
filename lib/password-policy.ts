import { z } from "zod";

/**
 * Single source of truth for the institutional password minimum.
 *
 * This module only lowers the minimum length floor from 12 to 8 characters.
 * Every other protection is unchanged: bcrypt hashing, session versioning /
 * invalidation, login rate limiting and brute-force protection, generic login
 * errors, forced-password-change handling and the maximum length cap.
 *
 * Server validation (API routes, bootstrap, seed), client validation
 * (administrator creation form) and user-facing messages all read from here.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export const PASSWORD_REQUIREMENT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

/** Length policy for operator-supplied passwords (bootstrap, demo auth, seed). */
export function meetsPasswordPolicy(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length >= MIN_PASSWORD_LENGTH && value.length <= MAX_PASSWORD_LENGTH;
}

export function passwordPolicyMessage(scope: string) {
  return `${scope} must be provided (${MIN_PASSWORD_LENGTH}-${MAX_PASSWORD_LENGTH} characters).`;
}
