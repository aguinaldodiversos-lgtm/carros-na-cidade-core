// src/modules/vehicles/vehicles.controller.js
import {
  uploadVehicleImages,
  toVehicleImageRecord,
} from "../../infrastructure/storage/r2.service.js";

// Exemplo: req.files vem de multer memoryStorage()
export async function createVehicle(req, res, next) {
  try {
    const payload = req.body;
    const files = Array.isArray(req.files) ? req.files : [];

    // 1) cria veículo no banco
    const vehicle = await req.services.vehicles.create(payload);

    // 2) sobe imagens para o R2
    const uploads =
      files.length > 0
        ? await uploadVehicleImages({
            vehicleId: vehicle.id,
            files,
            variant: "original",
            uploadedByUserId: req.user?.id ?? null,
            coverIndex: 0,
          })
        : [];

    // 3) persiste metadados das imagens no banco
    if (uploads.length > 0) {
      const imageRows = uploads.map((upload) =>
        toVehicleImageRecord(upload, {
          vehicle_id: vehicle.id,
        })
      );

      await req.services.vehicleImages.bulkInsert(imageRows);
    }

    // 4) responde
    return res.status(201).json({
      ok: true,
      vehicle,
      images: uploads,
    });
  } catch (error) {
    return next(error);
  }
}
