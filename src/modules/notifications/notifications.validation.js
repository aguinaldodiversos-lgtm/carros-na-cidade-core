// Validação de entrada do domínio de notificações. Cada helper normaliza e
// lança AppError com mensagem clara — nunca deixa passar valor cru. Mesmo
// estilo de `support.validation.js`.
//
// A validação aqui roda na CRIAÇÃO (código interno), não numa rota pública:
// não existe endpoint para o navegador criar notificação. Ainda assim ela é
// rígida, porque o dado gravado será renderizado no painel de outra pessoa —
// um `action_path` mal formado vira open redirect, e um `payload` gigante vira
// custo permanente na tabela.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  NOTIFICATION_ALLOWED_ACTION_PREFIXES,
  NOTIFICATION_LIMITS,
  NOTIFICATION_PAGE,
} from "./notifications.constants.js";

function asTrimmedString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function requireText(raw, field, { min, max, label }) {
  const value = asTrimmedString(raw);
  if (value.length < min) {
    throw new AppError(`${label} é obrigatório.`, 400, true, {
      code: "NOTIFICATION_INVALID_FIELD",
      field,
    });
  }
  if (value.length > max) {
    throw new AppError(`${label} pode ter no máximo ${max} caracteres.`, 400, true, {
      code: "NOTIFICATION_INVALID_FIELD",
      field,
    });
  }
  return value;
}

function optionalText(raw, field, { max, label }) {
  if (raw == null) return null;
  const value = asTrimmedString(raw);
  if (value === "") return null;
  if (value.length > max) {
    throw new AppError(`${label} pode ter no máximo ${max} caracteres.`, 400, true, {
      code: "NOTIFICATION_INVALID_FIELD",
      field,
    });
  }
  return value;
}

/** `event_type`: obrigatório, curto. Sem allowlist — ver constants. */
export function validateEventType(raw) {
  return requireText(raw, "event_type", {
    min: 1,
    max: NOTIFICATION_LIMITS.EVENT_TYPE_MAX,
    label: "O tipo do evento",
  });
}

export function validateTitle(raw) {
  return requireText(raw, "title", {
    min: NOTIFICATION_LIMITS.TITLE_MIN,
    max: NOTIFICATION_LIMITS.TITLE_MAX,
    label: "O título",
  });
}

export function validateBody(raw) {
  return requireText(raw, "body", {
    min: NOTIFICATION_LIMITS.BODY_MIN,
    max: NOTIFICATION_LIMITS.BODY_MAX,
    label: "O texto da notificação",
  });
}

export function validateEntityType(raw) {
  return optionalText(raw, "entity_type", {
    max: NOTIFICATION_LIMITS.ENTITY_TYPE_MAX,
    label: "O tipo da entidade",
  });
}

export function validateEntityId(raw) {
  if (raw == null) return null;
  // Aceita number (id de tabela) e string; normaliza para TEXT, que é o tipo
  // da coluna — polimórfico, então não pode assumir inteiro.
  const value = typeof raw === "number" ? String(raw) : asTrimmedString(raw);
  if (value === "") return null;
  if (value.length > NOTIFICATION_LIMITS.ENTITY_ID_MAX) {
    throw new AppError(
      `O id da entidade pode ter no máximo ${NOTIFICATION_LIMITS.ENTITY_ID_MAX} caracteres.`,
      400,
      true,
      { code: "NOTIFICATION_INVALID_FIELD", field: "entity_id" }
    );
  }
  return value;
}

export function validateIdempotencyKey(raw) {
  return requireText(raw, "idempotency_key", {
    min: NOTIFICATION_LIMITS.IDEMPOTENCY_KEY_MIN,
    max: NOTIFICATION_LIMITS.IDEMPOTENCY_KEY_MAX,
    label: "A chave de idempotência",
  });
}

/**
 * Caracteres que um caminho interno legítimo NUNCA contém e que navegadores
 * normalizam de formas surpreendentes: espaço, qualquer control-char
 * (U+0000–U+001F), DEL e barra-invertida (que vira `/`, podendo revelar um
 * `//host` escondido).
 *
 * Mesma defesa de `sanitizeInternalRedirect` no frontend, que é o validador
 * único do `next=` — a lição de lá vale aqui: um segundo validador mais fraco
 * num caminho alcançável foi exatamente o que causou o open redirect.
 */
function hasUnsafeChars(value) {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * `action_path`: opcional, e quando presente precisa ser um caminho INTERNO
 * dentro das áreas privadas.
 *
 * Camadas, na ordem:
 *   1. ausente/vazio → null (é opcional).
 *   2. tamanho máximo.
 *   3. caracteres inseguros literais (ver `hasUnsafeChars`).
 *   4. barra-invertida PERCENT-ENCODED (`%5C`) — sem uso legítimo interno.
 *   5. precisa começar com `/` e NÃO com `//` (protocol-relative). Isso já
 *      derruba `https://`, `javascript:` e `data:`, que não começam com `/`.
 *   6. resolução contra origem sentinela: mata `..` e qualquer coisa que o
 *      parser de URL enxergue como saindo da origem.
 *   7. ALLOWLIST de prefixo sobre o pathname normalizado.
 *
 * O passo 7 casa `prefixo` exato ou `prefixo + "/"` — nunca `startsWith` cru.
 * `"/dashboard-loja".startsWith("/dashboard")` é verdadeiro, então um prefixo
 * solto aceitaria também `/dashboard-qualquer-coisa`, incluindo rotas que não
 * existem hoje mas podem existir amanhã fora da área privada.
 *
 * @returns {string|null} caminho normalizado (com query/hash preservados) ou null
 */
export function validateActionPath(raw) {
  if (raw == null) return null;

  const value = typeof raw === "string" ? raw : "";
  if (value.trim() === "") return null;

  const reject = () => {
    throw new AppError("Caminho de destino inválido.", 400, true, {
      code: "NOTIFICATION_INVALID_ACTION_PATH",
      field: "action_path",
    });
  };

  if (value.length > NOTIFICATION_LIMITS.ACTION_PATH_MAX) reject();

  // NÃO fazer trim antes desta checagem: o espaço/tab inicial é justamente um
  // dos bypasses que queremos recusar, e trimar mascararia " /evil".
  if (hasUnsafeChars(value)) reject();
  if (/%5c/i.test(value)) reject();
  if (!value.startsWith("/") || value.startsWith("//")) reject();

  let resolved;
  try {
    const SENTINEL = "https://internal.invalid";
    const url = new URL(value, SENTINEL);
    if (url.origin !== SENTINEL) reject();
    resolved = `${url.pathname}${url.search}${url.hash}`;
  } catch {
    reject();
  }

  if (!resolved.startsWith("/") || resolved.startsWith("//")) reject();

  const pathname = resolved.split(/[?#]/)[0];
  const allowed = NOTIFICATION_ALLOWED_ACTION_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  if (!allowed) reject();

  return resolved;
}

/**
 * `payload`: objeto JSON simples, com teto de tamanho.
 *
 * Recusa array e primitivo porque a coluna existe para dados NOMEADOS de
 * exibição; um array solto não tem como ser lido pelo componente sem convenção
 * extra. O teto evita que a caixa postal vire depósito.
 */
export function validatePayload(raw) {
  if (raw == null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new AppError("O payload deve ser um objeto.", 400, true, {
      code: "NOTIFICATION_INVALID_FIELD",
      field: "payload",
    });
  }

  let serialized;
  try {
    serialized = JSON.stringify(raw);
  } catch {
    // Referência circular, BigInt, etc.
    throw new AppError("O payload não é serializável.", 400, true, {
      code: "NOTIFICATION_INVALID_FIELD",
      field: "payload",
    });
  }

  if (Buffer.byteLength(serialized, "utf8") > NOTIFICATION_LIMITS.PAYLOAD_MAX_BYTES) {
    throw new AppError(
      `O payload pode ter no máximo ${NOTIFICATION_LIMITS.PAYLOAD_MAX_BYTES} bytes.`,
      400,
      true,
      { code: "NOTIFICATION_INVALID_FIELD", field: "payload" }
    );
  }

  return raw;
}

/**
 * `:id` da rota → inteiro positivo.
 *
 * Id malformado vira 404, não 400: quem manda `/notifications/abc/read` está
 * sondando, e responder "id inválido" confirma o formato da chave. Mesmo
 * critério de `parseTicketId` no módulo de suporte.
 *
 * Exige a string INTEIRA em dígitos antes de converter, e não só
 * `Number.parseInt`. O `parseInt` sozinho lê o prefixo e descarta o resto:
 * `"1.5"` vira 1 e `"12abc"` vira 12, ou seja, `/notifications/1.5/read`
 * silenciosamente marcaria a notificação 1. Não é falha de autorização (o
 * UPDATE continua escopado ao dono), mas é a rota agindo sobre um recurso que
 * o cliente não pediu — e isso não deve acontecer.
 */
export function parseNotificationId(raw) {
  const asText = String(raw ?? "").trim();
  if (!/^\d+$/.test(asText)) {
    throw new AppError("Notificação não encontrada.", 404);
  }

  const id = Number.parseInt(asText, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError("Notificação não encontrada.", 404);
  }
  return id;
}

/** `limit` da query → inteiro dentro de [1, MAX]. Valor ausente/absurdo → default. */
export function parseLimit(raw) {
  if (raw == null || String(raw).trim() === "") return NOTIFICATION_PAGE.DEFAULT_LIMIT;
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return NOTIFICATION_PAGE.DEFAULT_LIMIT;
  return Math.min(parsed, NOTIFICATION_PAGE.MAX_LIMIT);
}

/**
 * Cursor de paginação: `"<createdAtISO>|<id>"`, codificado em base64url.
 *
 * Opaco para o cliente — não porque o conteúdo seja secreto, mas para que
 * ninguém construa cursor à mão e passe a depender do formato. Cursor
 * malformado é ignorado (volta à primeira página) em vez de virar erro: é
 * parâmetro de navegação, e falhar aqui quebraria o sino por um link velho.
 *
 * @returns {{ createdAt: string, id: number }|null}
 */
export function decodeCursor(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  try {
    const decoded = Buffer.from(String(raw), "base64url").toString("utf8");
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0) return null;

    const createdAt = decoded.slice(0, separator);
    const id = Number.parseInt(decoded.slice(separator + 1), 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (Number.isNaN(Date.parse(createdAt))) return null;

    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Inverso de `decodeCursor`. */
export function encodeCursor(row) {
  if (!row?.created_at || row?.id == null) return null;
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
  return Buffer.from(`${createdAt}|${row.id}`, "utf8").toString("base64url");
}
