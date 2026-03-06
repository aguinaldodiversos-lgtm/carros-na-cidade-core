export function buildFallback(task, input) {
  switch (task) {
    case "ad_description_short":
      return "Veículo em excelente estado. Documentação em dia. Entre em contato para mais informações e agendar uma visita.";

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
