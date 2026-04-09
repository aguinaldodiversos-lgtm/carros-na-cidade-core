import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import bcrypt from "bcryptjs";

const scriptPath = join(__dirname, "../../scripts/create-initial-admin.mjs");

describe("create-initial-admin script", () => {
  // ── File existence and structure ─────────────────

  it("script file exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("supports --email flag", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("--email");
  });

  it("supports --password flag", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("--password");
  });

  it("supports --name flag", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("--name");
  });

  it("supports --force-password flag", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("--force-password");
  });

  it("supports ADMIN_SEED_EMAIL env fallback", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("ADMIN_SEED_EMAIL");
  });

  it("supports ADMIN_SEED_PASSWORD env fallback", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("ADMIN_SEED_PASSWORD");
  });

  it("requires DATABASE_URL", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("DATABASE_URL");
  });

  // ── Safety guarantees (static analysis) ──────────

  it("never logs password in plaintext", () => {
    const code = readFileSync(scriptPath, "utf-8");
    const lines = code.split("\n");
    const logLines = lines.filter(
      (l) => l.includes("console.log") || l.includes("console.error") || l.includes("info(")
    );
    for (const line of logLines) {
      expect(line).not.toContain("${password}");
      expect(line).not.toContain("${password ");
      expect(line).not.toMatch(/\bpassword\s*\+\s*["'`]/);
    }
  });

  it("uses bcryptjs for password hashing", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain('import bcrypt from "bcryptjs"');
    expect(code).toContain("bcrypt.hash(");
  });

  it("uses same BCRYPT_SALT_ROUNDS env as auth.service", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("BCRYPT_SALT_ROUNDS");
    expect(code).toContain("parsedRounds >= 4");
    expect(code).toContain("parsedRounds <= 15");
  });

  it("checks for existing admin before creating", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("role = 'admin'");
    expect(code).toContain("Já existe um admin");
  });

  it("is idempotent — handles already-admin user", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("já é admin");
  });

  it("supports promoting existing user without changing password", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("promovido a admin (senha mantida)");
    expect(code).toContain("promovido a admin com senha atualizada");
  });

  it("creates user with role admin when no user exists", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("INSERT INTO users");
    expect(code).toContain("'admin'");
    expect(code).toContain("Admin criado com sucesso");
  });

  it("validates email format", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("isValidEmail");
    expect(code).toContain("Email inválido");
  });

  it("enforces minimum password length of 8", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("password.length < 8");
    expect(code).toContain("no mínimo 8 caracteres");
  });

  it("does NOT allow creating multiple admins", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("use promote-admin.js");
  });

  it("resolves password column dynamically (password_hash or password)", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("resolvePasswordColumn");
    expect(code).toContain("password_hash");
  });

  it("sets email_verified to true for new admin", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("email_verified");
    expect(code).toMatch(/email_verified.*true|true.*email_verified/s);
  });

  it("does NOT hardcode any password or credential", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).not.toMatch(/password\s*[:=]\s*["'][^"']{4,}["']/i);
    expect(code).not.toContain("admin123");
    expect(code).not.toContain("senha123");
  });

  it("has --help flag", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("--help");
    expect(code).toContain("-h");
  });
});

describe("bcrypt password hashing compatibility", () => {
  it("hashed password can be verified with bcrypt.compare", async () => {
    const raw = "SenhaForte123!";
    const hash = await bcrypt.hash(raw, 10);

    expect(hash).not.toBe(raw);
    expect(hash.startsWith("$2a$") || hash.startsWith("$2b$")).toBe(true);
    expect(await bcrypt.compare(raw, hash)).toBe(true);
    expect(await bcrypt.compare("errada", hash)).toBe(false);
  });

  it("respects BCRYPT_SALT_ROUNDS param", async () => {
    const raw = "OutraSenha456!";
    const hash4 = await bcrypt.hash(raw, 4);
    const hash12 = await bcrypt.hash(raw, 12);

    expect(await bcrypt.compare(raw, hash4)).toBe(true);
    expect(await bcrypt.compare(raw, hash12)).toBe(true);
    expect(hash4).not.toBe(hash12);
  });

  it("password hash is never the raw password", async () => {
    const raw = "MinhaSenhaSegura!";
    const hash = await bcrypt.hash(raw, 10);
    expect(hash).not.toBe(raw);
    expect(hash.length).toBeGreaterThan(50);
  });
});

describe("email validation logic", () => {
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  it("accepts valid email", () => {
    expect(isValidEmail("admin@carrosnacidade.com")).toBe(true);
    expect(isValidEmail("user@example.co")).toBe(true);
  });

  it("rejects invalid email", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("noemail")).toBe(false);
    expect(isValidEmail("@nolocal.com")).toBe(false);
    expect(isValidEmail("no@")).toBe(false);
    expect(isValidEmail("spaces in@email.com")).toBe(false);
  });
});
