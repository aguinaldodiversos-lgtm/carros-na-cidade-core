import { describe, expect, it } from "vitest";

import { classifyBreakPoint, parseImages } from "../../scripts/sanitize-ad-images.mjs";

describe("sanitize ad images script helpers", () => {
  it("parseia imagens de json string", () => {
    expect(parseImages('["/uploads/ads/a.jpg","/api/vehicle-images?key=x"]')).toEqual([
      "/uploads/ads/a.jpg",
      "/api/vehicle-images?key=x",
    ]);
  });

  it("detecta perda antes de vehicle_images", () => {
    expect(classifyBreakPoint(["/uploads/ads/a.jpg"], [], [])).toBe("lost_before_vehicle_images");
  });

  it("detecta vehicle_images sem fonte canônica", () => {
    expect(
      classifyBreakPoint(["/uploads/ads/a.jpg"], [{ image_url: "", storage_key: "" }], [])
    ).toBe("vehicle_images_without_canonical_source");
  });

  it("detecta anúncio recuperável quando há storage_key canônica", () => {
    expect(
      classifyBreakPoint(
        ["/uploads/ads/a.jpg"],
        [{ image_url: "", storage_key: "vehicles/ad-1/original/capa.webp" }],
        ["/api/vehicle-images?key=vehicles%2Fad-1%2Foriginal%2Fcapa.webp"]
      )
    ).toBe("ads_images_legacy_but_recoverable");
  });
});
