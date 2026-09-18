/**
 * One-time production bootstrap: create the FIRST (and only) SUPER_ADMIN.
 *
 * Security properties:
 * - NOT an HTTP/API endpoint; runs as an explicit operator command only.
 * - No default or embedded credentials: email, name and password must be
 *   supplied by the operator through environment variables on every run.
 * - Fails (and changes nothing) when a SUPER_ADMIN already exists.
 * - Fails when the target email is already registered in any role.
 * - Password is bcrypt-hashed with cost 12 (the project standard) and is
 *   never logged, echoed or persisted in plaintext.
 * - Writes an AuditLog entry attributing the account creation.
 *
 * Usage (see docs/DEPLOYMENT.md, "First administrator bootstrap"):
 *   DATABASE_URL="…" \
 *   BOOTSTRAP_ADMIN_EMAIL="admin@iet.example.ac.in" \
 *   BOOTSTRAP_ADMIN_NAME="Platform Administrator" \
 *   BOOTSTRAP_ADMIN_PASSWORD="<operator-generated password, 12+ chars>" \
 *   BOOTSTRAP_I_UNDERSTAND=yes \
 *   npx tsx scripts/bootstrap-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required.");
  }
  if (process.env.BOOTSTRAP_I_UNDERSTAND !== "yes") {
    throw new Error(
      "Refusing to run: this script creates a SUPER_ADMIN account. Set BOOTSTRAP_I_UNDERSTAND=yes only after reading docs/DEPLOYMENT.md (First administrator bootstrap) and confirming this is the initial bootstrap on a database without a super administrator.",
    );
  }
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address.");
  }
  if (!name || name.length < 2 || name.length > 120) {
    throw new Error("BOOTSTRAP_ADMIN_NAME must be provided (2-120 characters).");
  }
  if (!password || password.length < 12 || password.length > 200) {
    throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be provided (12-200 characters). Never use a default or shared password.");
  }

  const prisma = new PrismaClient();
  try {
    const existingSuperAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN" } });
    if (existingSuperAdmins > 0) {
      throw new Error(`Bootstrap aborted: ${existingSuperAdmins} SUPER_ADMIN account(s) already exist. Use the user administration screen for further accounts.`);
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error("Bootstrap aborted: an account with this email already exists (in any role). Choose a different email or manage the existing account.");
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, name, passwordHash, role: "SUPER_ADMIN", active: true },
      select: { id: true, email: true, name: true, role: true, active: true },
    });
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        role: "SUPER_ADMIN",
        action: "BOOTSTRAP_SUPER_ADMIN",
        entity: "users",
        entityId: user.id,
        afterJson: JSON.stringify({ email: user.email, role: user.role, bootstrap: true }),
      },
    });
    console.log(`Created SUPER_ADMIN account ${user.email} (${user.name}).`);
    console.log("Next steps: sign in at /admin/login, then create the remaining named accounts from the user administration screen. Share the temporary password through an approved channel and rotate it after first sign-in.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Bootstrap failed.");
  process.exit(1);
});
