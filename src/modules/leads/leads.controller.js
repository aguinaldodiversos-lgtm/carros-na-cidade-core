import { createLead } from "./leads.service.js";

export async function sendLead(req, res, next) {
  try {
    const { adId, buyerName, buyerPhone } = req.body;

    const lead = await createLead({
      adId,
      buyerName,
      buyerPhone,
    });

    res.json({
      success: true,
      lead,
    });
  } catch (err) {
    next(err);
  }
}
