/**
 * Flag de exibição do formulário "Enviar mensagem" no detalhe do anúncio.
 *
 * DESLIGADO em 2026-07-13 (decisão de produto, pré-divulgação do portal):
 * enquanto não existe a aba "Mensagens" no painel do lojista, o formulário
 *   - competia com o botão "Mensagem WhatsApp" (que funciona de verdade),
 *   - descartava a mensagem digitada pelo comprador (nunca era enviada), e
 *   - levava a um destino que é placeholder.
 * Então escondemos a UI de captura, mantendo "Mensagem WhatsApp" e "Ver
 * telefone". O backend do lead NÃO foi mexido: se um dia a flag voltar a
 * `true`, o POST /api/leads/whatsapp continua gravando o lead normalmente.
 *
 * Para REATIVAR (quando a aba Mensagens existir): troque para `true`. Os três
 * pontos de render já leem esta flag — VehicleDetailView (desktop),
 * VehicleDetailMobileShell (mobile) e PhoneRevealSheet (sheet do "Ver
 * telefone"). Nada mais precisa mudar.
 *
 * Tipada como `boolean` (não o literal `false`) de propósito, para não
 * disparar avisos de "condição sempre falsa" nos ternários que a consomem.
 */
export const LEAD_CONTACT_FORM_ENABLED: boolean = false;
