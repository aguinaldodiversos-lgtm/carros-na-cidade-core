export function buildFallback(task, _input) {
  switch (task) {
    case "ad_description_short":
      return "Veículo em excelente estado. Documentação em dia. Entre em contato para mais informações e agendar uma visita.";

    /**
     * SEM template. O chamador (ad-description.service) trata `null` como
     * falha e devolve erro ao cliente, deixando o textarea intocado.
     *
     * Um template aqui seria pior que erro: afirmaria fatos que o anunciante
     * não declarou e sairia IDÊNTICO em todo anúncio gerado sem IA — conteúdo
     * duplicado no próprio domínio, que é o oposto do objetivo da feature.
     */
    case "ad_description_suggestion":
      return null;

    case "whatsapp_message":
      return "Esse modelo vale a pena ver pessoalmente. Vamos marcar pra você vir tomar um café e olhar o carro com calma. Você consegue passar hoje no fim da tarde ou prefere amanhã?";

    case "lead_scoring":
      return {
        label: "morno",
        score: 50,
        reasons: ["Fallback sem IA"],
      };

    default:
      return null;
  }
}
