import express from "express";
import { sendLead } from "./leads.controller.js";

const router = express.Router();

router.post("/whatsapp", sendLead);

export default router;
