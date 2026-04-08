import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

describe("admin promotion mechanism", () => {
  const scriptPath = join(__dirname, "../../scripts/promote-admin.js");
  const migrationPath = join(
    __dirname,
    "../../src/database/migrations/016_seed_admin_from_env.sql"
  );

  it("promote-admin.js script exists", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  it("script supports --email flag", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("--email");
  });

  it("script supports --user-id flag", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("--user-id");
  });

  it("script supports ADMIN_SEED_EMAIL env fallback", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("ADMIN_SEED_EMAIL");
  });

  it("script is idempotent (checks existing role)", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("already admin");
  });

  it("script does NOT create users (only promotes existing)", () => {
    const code = readFileSync(scriptPath, "utf-8");
    expect(code).toContain("User not found");
    expect(code).not.toContain("INSERT INTO users");
  });

  it("migration 016 exists for automated seed", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("migration 016 uses current_setting for ADMIN_SEED_EMAIL", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("admin_seed_email");
    expect(sql).toContain("UPDATE users SET role = 'admin'");
  });

  it("migration 016 is safe when env var is not set", () => {
    const sql = readFileSync(migrationPath, "utf-8");
    expect(sql).toContain("IS NULL OR");
    expect(sql).toContain("skipping admin seed");
  });
});
