export function normalizePhone(phone) {
  if (!phone) return null;

  const digits = String(phone).replace(/\D/g, "");
  return digits || null;
}

export function validateWhatsAppJobData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Payload do job inválido");
  }

  const normalizedPhone = normalizePhone(data.phone);

  if (!normalizedPhone) {
    throw new Error("Telefone inválido ou ausente");
  }

  if (!data.message || String(data.message).trim().length === 0) {
    throw new Error("Mensagem inválida ou ausente");
  }

  const out = {
    ...data,
    phone: normalizedPhone,
    message: String(data.message).trim(),
  };

  if (data.dealerLeadId != null) {
    const n = Number(data.dealerLeadId);
    if (Number.isFinite(n) && n > 0) {
      out.dealerLeadId = n;
    }
  }

  if (data.cityId != null) {
    const n = Number(data.cityId);
    if (Number.isFinite(n) && n > 0) {
      out.cityId = n;
    }
  }

  return out;
}
