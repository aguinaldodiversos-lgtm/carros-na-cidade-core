/**
 * Teste offline: reproduz a normalização de imagens usada em /api/ads/search → card /comprar.
 * Uso: node scripts/test-public-ad-images.mjs
 */
import { buildNormalizedPublicImages } from "../src/modules/ads/ads.public-images.js";

const samples = [
  {
    name: "URLs proxy relativas (pós-upload R2 típico)",
    row: {
      id: 1,
      images: ["/api/vehicle-images?key=vehicles/abc/photo.png"],
    },
    vehicleRows: [],
  },
  {
    name: "JSON em string (como às vezes vem do legado)",
    row: {
      id: 2,
      images: '["/api/vehicle-images?key=vehicles/x/y.png"]',
    },
    vehicleRows: [],
  },
  {
    name: "Objeto com photos[] (aninhado)",
    row: {
      id: 3,
      images: { photos: ["/api/vehicle-images?key=vehicles/nested/1.png"] },
    },
    vehicleRows: [],
  },
  {
    name: "vehicle_images tem prioridade — 1ª linha com storage_key",
    row: {
      id: 4,
      images: ["/uploads/ads/legacy-only.jpg"],
    },
    vehicleRows: [{ storage_key: "vehicles/ad4/cover.png", image_url: "" }],
  },
  {
    name: "vehicle_images vazio + ads.images com proxy",
    row: {
      id: 5,
      images: ["/api/vehicle-images?key=vehicles/only-json.png"],
    },
    vehicleRows: [],
  },
];

console.log("buildNormalizedPublicImages (core) — URLs finais para image_url[0]:\n");

for (const { name, row, vehicleRows } of samples) {
  const out = buildNormalizedPublicImages(row, vehicleRows);
  console.log(`— ${name}`);
  console.log("  →", JSON.stringify(out, null, 2));
  console.log("");
}

console.log("Conclusão: se `images` no banco estiver vazio, mal formatado ou só legado /uploads/… sem arquivo no R2, o card cai no placeholder.");
