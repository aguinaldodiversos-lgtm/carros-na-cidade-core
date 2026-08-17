// Classificação TIPADA de falha no pipeline de imagem.
//
// ────────────────────────────────────────────────────────────────────────────
// O BUG QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
// ────────────────────────────────────────────────────────────────────────────
// No smoke da Fase 4.1 o R2 respondeu "The specified bucket does not exist" e o
// usuário recebeu:
//
//     HTTP 400 · SALE_REQUEST_INVALID_PHOTO
//     "Não foi possível enviar uma das fotos. Use JPG, PNG ou WebP de até 10 MB."
//
// A foto estava perfeita. O problema era do storage. A pessoa foi mandada
// converter, redimensionar e reenviar um arquivo que nunca teve defeito — e
// nenhuma dessas tentativas poderia funcionar.
//
// Um `catch (error)` genérico não consegue distinguir as duas coisas. Estas
// classes fazem a distinção acontecer NA CAMADA QUE SABE a resposta: quem chama
// `validateVehicleImageFile`/`normalizeVehicleImage` sabe que está julgando o
// ARQUIVO; quem chama `PutObject` sabe que está falando com o STORAGE.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE NÃO CLASSIFICAR POR STRING
// ────────────────────────────────────────────────────────────────────────────
// A tentação é `if (message.includes("bucket"))`. Isso amarra o contrato HTTP do
// produto às mensagens internas do SDK da AWS, que mudam entre versões menores e
// variam por idioma e por provedor (R2, MinIO e S3 não descrevem o mesmo erro do
// mesmo jeito). O primeiro texto que mudasse voltaria a culpar a foto do
// usuário, e nenhum teste unitário acusaria — porque o mock continuaria usando a
// string antiga.
//
// A classificação aqui é ESTRUTURAL: depende de QUAL ETAPA falhou, não do que a
// etapa escreveu.
//
// ────────────────────────────────────────────────────────────────────────────
// FRONTEIRA DE MÓDULO
// ────────────────────────────────────────────────────────────────────────────
// Estas classes são GENÉRICAS de propósito. Não conhecem `sale_requests`, não
// importam constantes de domínio e não decidem status HTTP. Infraestrutura
// classifica a NATUREZA da falha; quem traduz natureza em contrato HTTP é o
// service do domínio.

/**
 * O ARQUIVO enviado é o problema: MIME recusado, vazio, acima do limite,
 * corrompido ou impossível de decodificar.
 *
 * `expose` carrega adiante a decisão de quem criou o erro original. O projeto já
 * tem esse contrato (`UnsupportedImageFormatError` em `image-normalizer.js` usa
 * `expose = true` para entregar mensagens acionáveis, como a que explica ao dono
 * de iPhone onde desligar o "alta eficiência"). Sem propagar o sinalizador, o
 * tradutor no service teria de escolher entre engolir essas mensagens boas ou
 * expor qualquer string interna — e a segunda opção já vazou offset de libvips
 * para a tela do usuário uma vez.
 */
export class ImageInputError extends Error {
  constructor(message, { cause = null, expose = false } = {}) {
    super(message);
    this.name = "ImageInputError";
    this.cause = cause;
    this.expose = expose === true;
  }
}

/**
 * O STORAGE é o problema: configuração ausente, credencial recusada, bucket
 * inexistente, endpoint fora do ar, timeout ou falha no PutObject.
 *
 * A `message` daqui é INTERNA — vai para o log, nunca para a resposta HTTP. É
 * por isso que ela não tenta ser amigável: quem escreve o texto que o usuário lê
 * é o service do domínio, que sabe o contexto do produto.
 *
 * `stage` separa "não consegui nem montar o cliente" de "falhei ao gravar",
 * porque as duas exigem investigações diferentes: a primeira é quase sempre
 * variável de ambiente faltando; a segunda é permissão, bucket ou rede.
 */
export class ObjectStorageError extends Error {
  constructor(message, { cause = null, stage = "unknown" } = {}) {
    super(message);
    this.name = "ObjectStorageError";
    this.cause = cause;
    this.stage = stage;
  }
}

/**
 * Detalhe técnico SEGURO do erro original, para log interno.
 *
 * Devolve nome e mensagem do erro de origem — o suficiente para diagnosticar
 * ("NoSuchBucket", "The specified bucket does not exist", "Variável obrigatória
 * ausente: R2_BUCKET_NAME") — e NUNCA o objeto inteiro. O erro do SDK da AWS
 * carrega `$metadata`, cabeçalhos e, dependendo do caminho, a configuração de
 * credenciais resolvida; despejá-lo no log com `err: error` colocaria segredo
 * em disco.
 *
 * Isto alimenta o LOG. A resposta HTTP não usa nada disto.
 */
export function describeStorageFailure(error) {
  if (!error) return { name: null, message: null };
  return {
    name: String(error.name || "Error"),
    message: String(error.message || "").slice(0, 300),
    ...(error.$metadata?.httpStatusCode ? { httpStatus: error.$metadata.httpStatusCode } : {}),
  };
}
