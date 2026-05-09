/**
 * Motivos canônicos de denúncia. Devem casar com o CHECK constraint da
 * migration 026_ad_reports.sql (reason IN (...)). Mantemos a lista aqui
 * para que controller e UI usem a mesma fonte.
 */
export const AD_REPORT_REASONS = Object.freeze([
  "suspicious_price",
  "incorrect_data",
  "vehicle_does_not_exist",
  "scam_or_advance_pay",
  "fake_photos",
  "other",
]);

export const AD_REPORT_REASON_LABEL = Object.freeze({
  suspicious_price: "Preço suspeito",
  incorrect_data: "Dados incorretos",
  vehicle_does_not_exist: "Veículo não existe",
  scam_or_advance_pay: "Golpe ou pedido de pagamento antecipado",
  fake_photos: "Fotos falsas",
  other: "Outro motivo",
});

/**
 * Janela de rate limit por IP — defesa contra spam de denúncia.
 * Definida pequena para não derrubar uso legítimo (1 anúncio em 1 hora =
 * 5 denúncias é ok), mas bloqueia inundação de centenas em segundos.
 */
export const AD_REPORTS_RATE_LIMIT = Object.freeze({
  WINDOW_SECONDS: 60 * 60, // 1 hora
  MAX_PER_IP: 10,
  MAX_PER_AD_PER_IP: 3,
});

export const AD_REPORT_DESCRIPTION_MAX_LENGTH = 1000;
