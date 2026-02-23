function normalizeWhatsAppNumber(input) {
  if (!input) return null;

  const digits = input.replace(/\D/g, "");

  if (digits.length < 10) {
    throw new Error("Número de WhatsApp inválido");
  }

  // Se já começa com 55 (Brasil)
  if (digits.startsWith("55")) {
    return digits;
  }

  // Se não começa com 55, adiciona
  return `55${digits}`;
}

module.exports = {
  normalizeWhatsAppNumber,
};
