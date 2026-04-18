// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  inferMimeFromFileName,
  snapshotPhotoFiles,
  filesFromSnapshots,
  formDataFromSnapshots,
} from "./upload-draft-photo-snapshots";

describe("upload-draft-photo-snapshots", () => {
  it("inferMimeFromFileName maps common extensions", () => {
    expect(inferMimeFromFileName("x.png")).toBe("image/png");
    expect(inferMimeFromFileName("x.JPEG")).toBe("image/jpeg");
    expect(inferMimeFromFileName("noext")).toBe("image/jpeg");
  });

  it("snapshotPhotoFiles copies bytes and infers type when empty", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const f = new File([bytes], "test.png", { type: "" });
    const snaps = await snapshotPhotoFiles([f]);
    expect(snaps).toHaveLength(1);
    expect(snaps[0].type).toBe("image/png");
    expect([...snaps[0].buffer]).toEqual([1, 2, 3, 4]);
  });

  it("filesFromSnapshots and formDataFromSnapshots produce readable files", async () => {
    const snaps = [{ name: "a.jpg", type: "image/jpeg", buffer: Buffer.from([9, 9]) }];
    const files = filesFromSnapshots(snaps);
    expect(files[0].size).toBe(2);
    const buf = Buffer.from(await files[0].arrayBuffer());
    expect([...buf]).toEqual([9, 9]);

    const fd = formDataFromSnapshots(snaps);
    const back = fd.getAll("photos")[0] as File;
    expect(back.size).toBe(2);
  });
});
