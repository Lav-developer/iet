import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { assertProductionConfig, assertDemoAuthConfig, demoAuthEnabled, isProduction } from "@/lib/config";
import { databaseConfigured, getPrisma } from "@/lib/db";

const COOKIE_NAME = "iet_session";
const DEV_SECRET = randomBytes(32).toString("hex");

export type UserRole = "SUPER_ADMIN" | "IET_ADMIN" | "DEPARTMENT_ADMIN" | "EDITOR";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  departmentId?: string;
  sessionVersion?: number;
};

function secret() {
  const configured = process.env.AUTH_SECRET?.trim();
  if (isProduction) {
    assertProductionConfig();
    return new TextEncoder().encode(configured);
  }
  return new TextEncoder().encode(configured || DEV_SECRET);
}

export async function authenticate(email: string, password: string): Promise<SessionUser | null> {
  const prisma = getPrisma();
  if (prisma) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return { id: user.id, email: user.email, name: user.name, role: user.role, departmentId: user.departmentId || undefined, sessionVersion: user.sessionVersion };
  }

  if (!demoAuthEnabled()) return null;
  const credentials = assertDemoAuthConfig();
  if (email.trim().toLowerCase() !== credentials.email.toLowerCase() || password !== credentials.password) return null;
  return { id: "demo-admin", email: credentials.email, name: "IET Administrator", role: "IET_ADMIN", sessionVersion: 0 };
}

export async function setSession(user: SessionUser) {
  assertProductionConfig();
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setJti(randomBytes(16).toString("hex"))
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
}

export async function getSession(): Promise<SessionUser | null> {
  assertProductionConfig();
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.email || !payload.role || !payload.sub) return null;

    if (databaseConfigured) {
      const prisma = getPrisma();
      if (!prisma) return null;
      const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
      if (!user || !user.active) return null;
      const tokenVersion = Number(payload.sessionVersion ?? 0);
      if (user.sessionVersion !== tokenVersion) return null;
      return { id: user.id, email: user.email, name: user.name, role: user.role, departmentId: user.departmentId || undefined, sessionVersion: user.sessionVersion };
    }

    if (!demoAuthEnabled()) return null;
    return {
      id: String(payload.sub),
      email: String(payload.email),
      name: String(payload.name || "IET Administrator"),
      role: payload.role as UserRole,
      departmentId: payload.departmentId ? String(payload.departmentId) : undefined,
      sessionVersion: Number(payload.sessionVersion ?? 0),
    };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function requireAdmin() {
  const user = await getSession();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}
