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

  return {
    ...data,
    phone: normalizedPhone,
    message: String(data.message).trim(),
  };
}
