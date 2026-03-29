import express from "express";
import { recordAdEvent } from "./ad-events.ingest.js";

const router = express.Router();

/** POST /api/ads/event — preferido pelo frontend; handler compartilhado com `events.routes.js` */
router.post("/event", recordAdEvent);

export default router;
