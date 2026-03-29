import express from "express";
import { recordAdEvent } from "./ad-events.ingest.js";

const router = express.Router();

/** POST /api/events — alias de `POST /api/ads/event`; lógica só em `ad-events.ingest.js` */
router.post("/", recordAdEvent);

export default router;
