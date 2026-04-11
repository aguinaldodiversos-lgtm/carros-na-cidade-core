/**
 * Metadados definidos pelo utilizador no S3/R2 são enviados como cabeçalhos HTTP e devem
 * ser ASCII. Nomes de ficheiro com acentos (ex.: "veículo.jpg") fazem falhar o PutObject.
 */
export function sanitizeS3MetadataValue(value: string, maxLen = 512): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "_")
    .slice(0, maxLen);
}
