import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * AS PROTEÇÕES DA /seguranca — por CONCEITO, não por frase.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE ESTE ARQUIVO FOI REESCRITO (CI-0, 2026-09-03)
 * ════════════════════════════════════════════════════════════════════════════
 * A versão anterior procurava a redação literal de 2026-06: o título "O que o
 * Carros na Cidade faz na moderação dos anúncios" e a frase "O que NÃO fazemos:
 * consulta Detran, vistoria física, validação documental completa nem garantia
 * de procedência".
 *
 * Em 2026-07-05 o commit `b43cfe1d` substituiu TODO o corpo da página por texto
 * institucional novo — e não atualizou o teste. Desde então dois casos estavam
 * vermelhos, e a leitura ficou invertida: parecia haver perda de proteção
 * jurídica quando, auditado o texto, a página nova protege MAIS que a antiga
 * (acrescentou identidade dos usuários e existência do veículo à lista do que o
 * portal não garante).
 *
 * O erro do teste antigo não foi ter falhado — foi o que ele media. Amarrar
 * proteção jurídica a uma string exata transforma qualquer reescrita de copy em
 * alarme falso, e um alarme falso que toca há dois meses deixa de ser lido.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO PROTEGE AGORA
 * ════════════════════════════════════════════════════════════════════════════
 * Os SETE invariantes abaixo. Cada um aceita mais de uma redação, porque o que
 * não pode sumir é o conceito. O que continua proibido é o oposto: promessa de
 * segurança que o produto não pode cumprir.
 *
 * Se um dia a copy for reescrita de novo, este teste só falha se uma proteção
 * REAL desaparecer — e aí a falha é informação, não ruído.
 */

const filePath = join(process.cwd(), "app", "seguranca", "page.tsx");
const source = readFileSync(filePath, "utf8");

/**
 * Cada invariante com as redações que o satisfazem. Aceitar alternativas é
 * deliberado: a proteção é o conceito, e a página pode dizê-lo de mais de um
 * jeito sem enfraquecer nada.
 */
const INVARIANTES: { conceito: string; aceita: RegExp }[] = [
  {
    conceito: "o portal é um ambiente de anúncios, não um vendedor",
    aceita: /(portal|ambiente) de divulga[çc][ãa]o de an[úu]ncios/i,
  },
  {
    conceito: "o portal não se torna parte da negociação",
    aceita: /n[ãa]o (significa que o Carros na Cidade )?se torna parte da negocia[çc][ãa]o/i,
  },
  {
    conceito: "o portal PODE revisar, remover, bloquear e suspender",
    aceita:
      /revisar an[úu]ncios|remover conte[úu]dos|bloquear usu[áa]rios|suspender publica[çc][õo]es/i,
  },
  {
    conceito: "verificação interna NÃO equivale a garantia de procedência",
    aceita: /n[ãa]o garante a proced[êe]ncia|garantia de proced[êe]ncia/i,
  },
  {
    conceito: "revisão do portal NÃO equivale a certificação do veículo",
    aceita: /n[ãa]o garante a (identidade plena|exist[êe]ncia do ve[íi]culo)/i,
  },
  {
    conceito: "o portal não substitui análise/vistoria independente",
    aceita: /n[ãa]o substitui a an[áa]lise individual|verifica[çc][ãa]o independente/i,
  },
  {
    conceito: "comprador e vendedor seguem responsáveis pela negociação",
    aceita: /exclusiva responsabilidade das partes/i,
  },
];

describe("/seguranca — invariantes de proteção jurídica", () => {
  for (const { conceito, aceita } of INVARIANTES) {
    it(`declara: ${conceito}`, () => {
      expect(
        source,
        `A página precisa expressar "${conceito}". A redação pode mudar; o conceito, não.`
      ).toMatch(aceita);
    });
  }

  it("vistoria e documentação ficam com as partes, não com o portal", () => {
    // A "Declaração final" é onde isso é dito de forma abrangente. Se ela sair,
    // a proteção mais ampla da página sai junto.
    expect(source).toMatch(
      /vistoria, documenta[çc][ãa]o, transfer[êe]ncia, garantia e responsabilidade/i
    );
  });

  it("mantém o canal de denúncia e o sinal de análise interna", () => {
    expect(source).toMatch(/den[úu]nci/i);
    expect(source).toMatch(/an[áa]lise|reavalia|avalie medidas/i);
  });
});

describe("/seguranca — promessas que a página NÃO pode fazer", () => {
  /**
   * Estas asserções de ausência têm valor real: as frases já foram usadas em
   * material de marketing do próprio projeto, então não é texto inventado que
   * nunca poderia aparecer. Se voltarem para a vitrine pública, o portal passa a
   * prometer segurança que não pode cumprir.
   */
  const PROIBIDAS = [
    /compra segura garantida/i,
    /sem risco/i,
    /100% seguro/i,
    /ve[íi]culo (verificado|certificado) pelo Carros na Cidade/i,
    /garantimos a proced[êe]ncia/i,
  ];

  for (const proibida of PROIBIDAS) {
    it(`não promete ${proibida.source}`, () => {
      expect(source).not.toMatch(proibida);
    });
  }
});
