/**
 * Prefixo internacional do Brasil.
 *
 * O portal opera só no Brasil e os números são gravados SEM DDI (o formulário
 * da loja pede "(11) 99999-9999"). Por isso o 55 é acrescentado na leitura, não
 * na escrita — o dado no banco continua como o lojista digitou.
 */
const BRAZIL_COUNTRY_CODE = "55";

/**
 * Dígitos prontos para um link `wa.me`, ou `null`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE NÃO É `normalizeBrazilPhoneDigits`
 * ────────────────────────────────────────────────────────────────────────────
 * As duas funções normalizam telefone brasileiro, mas respondem a perguntas
 * diferentes e por isso têm rigor diferente:
 *
 *   normalizeBrazilPhoneDigits  — INGESTÃO (dealer-acquisition). Aceita de 8 a
 *     13 dígitos porque ali o objetivo é guardar o que chegou de uma origem
 *     externa sem perder o registro. Um número parcial ainda é um dado útil.
 *
 *   normalizeWhatsappDigits     — SAÍDA. O resultado vira uma URL que uma
 *     pessoa vai CLICAR. Um número de 8 dígitos passaria no filtro acima e
 *     produziria `wa.me/5512345678`, que abre o WhatsApp numa conversa
 *     inexistente — pior do que dizer "esta loja não tem WhatsApp", porque o
 *     comprador acha que falou com a loja e fica esperando resposta.
 *
 * Então aqui o contrato é: celular brasileiro completo (DDD + 8 ou 9 dígitos),
 * ou `null`. Nada de chute.
 *
 * MESMA REGRA DO FRONTEND. É byte-a-byte o comportamento de
 * `normalizeBrazilPhone` em `frontend/lib/vehicle/detail-utils.ts`, que hoje
 * constrói os `wa.me` do anúncio público. Se as duas divergissem, o mesmo
 * telefone geraria um link no catálogo e nenhum na área do comprador.
 *
 * DDI NÃO DUPLICA: quando os dígitos já começam com 55 E o que sobra tem 10 ou
 * 11 dígitos, o valor é devolvido como está. É o caso de "+55 11 99999-9999",
 * que sem essa checagem viraria "555511999999999".
 *
 * O zero à esquerda ("011 99999-9999") é de discagem interurbana e não faz
 * parte do número.
 *
 * @param {string|undefined|null} input
 * @returns {string|null} ex.: "5511999999999"
 */
export function normalizeWhatsappDigits(input) {
  const digits = String(input ?? "")
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (!digits) return null;

  if (digits.startsWith(BRAZIL_COUNTRY_CODE)) {
    const local = digits.slice(BRAZIL_COUNTRY_CODE.length);
    if (local.length === 10 || local.length === 11) return digits;
  }

  if (digits.length === 10 || digits.length === 11) {
    return `${BRAZIL_COUNTRY_CODE}${digits}`;
  }

  return null;
}

/**
 * Normaliza telefone brasileiro para apenas dígitos com prefixo 55 quando possível.
 *
 * Contrato FROUXO, para ingestão. Para gerar link de WhatsApp use
 * `normalizeWhatsappDigits` — ver o comentário dela.
 *
 * @param {string|undefined|null} input
 * @returns {string|null}
 */
export function normalizeBrazilPhoneDigits(input) {
  if (input === undefined || input === null) return null;

  const d = String(input).replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("55") && d.length >= 12 && d.length <= 13) {
    return d;
  }

  if (d.length === 10 || d.length === 11) {
    return `55${d}`;
  }

  if (d.length >= 8 && d.length <= 13) {
    return d.startsWith("55") ? d : `55${d}`;
  }

  return null;
}
