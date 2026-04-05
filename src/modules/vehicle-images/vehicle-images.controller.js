// src/modules/vehicle-images/vehicle-images.controller.js
import { readVehicleImage } from "../../infrastructure/storage/r2.service.js";

export async function getVehicleImageByKey(req, res, next) {
  try {
    const key = req.query.key || "";
    const image = await readVehicleImage(key);

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.contentLength));
    res.setHeader("Cache-Control", image.cacheControl);
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.status(200).send(image.buffer);
  } catch (error) {
    return next(error);
  }
}
