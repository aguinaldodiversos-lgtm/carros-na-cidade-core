export const VEHICLE_COLORS = [
  "Branco",
  "Prata",
  "Preto",
  "Cinza",
  "Vermelho",
  "Azul",
  "Verde",
  "Marrom",
  "Bege",
  "Dourado",
  "Laranja",
  "Amarelo",
  "Roxo",
  "Outra",
] as const;

export type OptionalItem = { id: string; label: string };

export const OPTIONAL_ITEMS: OptionalItem[] = [
  { id: "ac", label: "Ar-condicionado" },
  { id: "dh", label: "Direção hidráulica / elétrica" },
  { id: "ve", label: "Vidros elétricos" },
  { id: "airbag", label: "Airbag" },
  { id: "abs", label: "Freio ABS" },
  { id: "couro", label: "Banco de couro" },
  { id: "board", label: "Computador de bordo" },
  { id: "liga", label: "Rodas de liga leve" },
  { id: "teto", label: "Teto solar" },
  { id: "sensor", label: "Sensor de estacionamento" },
  { id: "camera", label: "Câmera de ré" },
  { id: "multimidia", label: "Central multimídia" },
];

export const CONDITION_ITEMS: OptionalItem[] = [
  { id: "unico", label: "Único dono" },
  { id: "troca", label: "Aceita troca" },
  { id: "ipva", label: "IPVA pago" },
  { id: "lic", label: "Licenciado" },
  { id: "garantia", label: "Garantia de fábrica" },
  { id: "revisoes", label: "Revisões em concessionária" },
  { id: "fin", label: "Veículo financiado" },
  { id: "leilao", label: "Veículo de leilão" },
  { id: "adaptado", label: "Adaptado para deficiente" },
  { id: "colecionador", label: "Veículo colecionador" },
];
