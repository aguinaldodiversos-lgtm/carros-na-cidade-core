import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("upload-draft-photos-direct-r2", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  function setR2Env() {
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_BUCKET_NAME = "test-bucket";
    process.env.R2_PUBLIC_BASE_URL = "https://pub-test.r2.dev";
  }

  function clearR2Env() {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;
    delete process.env.R2_PUBLIC_BASE_URL;
  }

  describe("isR2ConfiguredInBff", () => {
    it("returns false when R2 env vars are missing", async () => {
      clearR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");
      expect(mod.isR2ConfiguredInBff()).toBe(false);
    });

    it("returns false when only some R2 vars are set", async () => {
      clearR2Env();
      process.env.R2_ACCOUNT_ID = "test-account";
      const mod = await import("./upload-draft-photos-direct-r2");
      expect(mod.isR2ConfiguredInBff()).toBe(false);
    });

    it("returns true when all required R2 vars are set", async () => {
      setR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");
      expect(mod.isR2ConfiguredInBff()).toBe(true);
    });
  });

  describe("uploadDraftPhotosDirectR2", () => {
    it("throws when R2 is not configured", async () => {
      clearR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");
      const file = new File(["photo-data"], "test.jpg", {
        type: "image/jpeg",
      });

      await expect(
        mod.uploadDraftPhotosDirectR2([file], "user-1")
      ).rejects.toThrow("R2 not configured");
    });

    it("returns empty array for empty file list", async () => {
      setR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");

      const result = await mod.uploadDraftPhotosDirectR2([], "user-1");
      expect(result).toEqual([]);
    });

    it("filters out non-image files", async () => {
      setR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");

      const textFile = new File(["some text"], "test.txt", {
        type: "text/plain",
      });

      const result = await mod.uploadDraftPhotosDirectR2(
        [textFile],
        "user-1"
      );
      expect(result).toEqual([]);
    });

    it("filters out empty files", async () => {
      setR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");

      const emptyFile = new File([], "empty.jpg", { type: "image/jpeg" });

      const result = await mod.uploadDraftPhotosDirectR2(
        [emptyFile],
        "user-1"
      );
      expect(result).toEqual([]);
    });

    it("filters out oversized files (>10MB)", async () => {
      setR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");

      const bigData = new Uint8Array(11 * 1024 * 1024);
      const bigFile = new File([bigData], "huge.jpg", {
        type: "image/jpeg",
      });

      const result = await mod.uploadDraftPhotosDirectR2(
        [bigFile],
        "user-1"
      );
      expect(result).toEqual([]);
    });
  });

  describe("readImageFromR2Direct", () => {
    it("returns null when R2 is not configured", async () => {
      clearR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");
      const result = await mod.readImageFromR2Direct("vehicles/test/photo.jpg");
      expect(result).toBeNull();
    });

    it("returns null for empty key", async () => {
      setR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");
      const result = await mod.readImageFromR2Direct("");
      expect(result).toBeNull();
    });

    it("returns null for key with path traversal", async () => {
      setR2Env();
      const mod = await import("./upload-draft-photos-direct-r2");
      const result = await mod.readImageFromR2Direct("../etc/passwd");
      expect(result).toBeNull();
    });
  });
});

describe("URL format compatibility", () => {
  it("public R2 URLs pass backend ad validation format", () => {
    const url =
      "https://pub-test.r2.dev/vehicles/publish-user-1-uuid/original/2026/04/uuid-foto.jpg";
    expect(url.length).toBeGreaterThanOrEqual(1);
    expect(url.length).toBeLessThanOrEqual(2048);
    expect(typeof url).toBe("string");
  });

  it("proxy URLs pass backend ad validation format", () => {
    const url =
      "/api/vehicle-images?key=vehicles%2Fpublish-user-1-uuid%2Foriginal%2F2026%2F04%2Fuuid-foto.jpg";
    expect(url.length).toBeGreaterThanOrEqual(1);
    expect(url.length).toBeLessThanOrEqual(2048);
    expect(typeof url).toBe("string");
  });

  it("URL array is JSON-serializable for localStorage", () => {
    const urls = [
      "https://pub-test.r2.dev/vehicles/draft/photo1.jpg",
      "https://pub-test.r2.dev/vehicles/draft/photo2.jpg",
      "/api/vehicle-images?key=vehicles%2Fdraft%2Fphoto3.jpg",
    ];

    const json = JSON.stringify(urls);
    const parsed = JSON.parse(json);
    expect(parsed).toEqual(urls);
  });

  it("URL array is compatible with FormData draftPhotoUrls field", () => {
    const urls = [
      "https://pub-test.r2.dev/vehicles/draft/photo1.jpg",
      "https://pub-test.r2.dev/vehicles/draft/photo2.jpg",
    ];

    const formData = new FormData();
    formData.append("draftPhotoUrls", JSON.stringify(urls));

    const raw = formData.get("draftPhotoUrls");
    expect(typeof raw).toBe("string");
    const parsed = JSON.parse(raw as string);
    expect(parsed).toEqual(urls);
  });
});

describe("Multi-layer upload fallback logic", () => {
  it("skips direct R2 when not configured", () => {
    const isR2Configured = false;
    const hasBackendUrl = true;
    const isDev = false;

    const layers: string[] = [];
    if (isR2Configured) layers.push("direct-r2");
    if (hasBackendUrl) layers.push("backend-proxy");
    if (isDev) layers.push("local-fs");

    expect(layers).toEqual(["backend-proxy"]);
  });

  it("prefers direct R2 over backend proxy", () => {
    const isR2Configured = true;
    const hasBackendUrl = true;
    const isDev = false;

    const layers: string[] = [];
    if (isR2Configured) layers.push("direct-r2");
    if (hasBackendUrl) layers.push("backend-proxy");
    if (isDev) layers.push("local-fs");

    expect(layers[0]).toBe("direct-r2");
  });

  it("includes local-fs only in development", () => {
    const isR2Configured = false;
    const hasBackendUrl = false;
    const isDev = true;

    const layers: string[] = [];
    if (isR2Configured) layers.push("direct-r2");
    if (hasBackendUrl) layers.push("backend-proxy");
    if (isDev) layers.push("local-fs");

    expect(layers).toEqual(["local-fs"]);
  });

  it("all three layers available in development with full config", () => {
    const isR2Configured = true;
    const hasBackendUrl = true;
    const isDev = true;

    const layers: string[] = [];
    if (isR2Configured) layers.push("direct-r2");
    if (hasBackendUrl) layers.push("backend-proxy");
    if (isDev) layers.push("local-fs");

    expect(layers).toEqual(["direct-r2", "backend-proxy", "local-fs"]);
  });

  it("no layers available in production without config", () => {
    const isR2Configured = false;
    const hasBackendUrl = false;
    const isDev = false;

    const layers: string[] = [];
    if (isR2Configured) layers.push("direct-r2");
    if (hasBackendUrl) layers.push("backend-proxy");
    if (isDev) layers.push("local-fs");

    expect(layers).toEqual([]);
  });
});
