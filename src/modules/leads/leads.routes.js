import express from "express";
import { sendLead, registerWhatsappLead } from "./leads.controller.js";

const router = express.Router();

router.post("/whatsapp", sendLead);
// Registro leve de contato via clique no WhatsApp (sem PII) — herda o mesmo
// CORS do router montado em /api/leads (app.js).
router.post("/whatsapp-click", registerWhatsappLead);

export default router;
