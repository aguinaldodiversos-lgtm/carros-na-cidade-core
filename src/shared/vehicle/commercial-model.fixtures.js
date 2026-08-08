// src/shared/vehicle/commercial-model.fixtures.js
//
// Fixtures COMPARTILHADAS entre backend (`commercial-model.test.js`) e
// frontend (`frontend/lib/vehicle/commercial-model.test.ts`). É este arquivo
// que garante que os dois espelhos derivem exatamente a mesma entidade — se
// um lado disser "onix" e o outro "onix-hatch", o link gerado num lado não
// resolve no outro.
//
// Os casos marcados `real: true` são valores LITERAIS do inventário ativo de
// produção (auditoria 2026-08-07, 27 anúncios em Atibaia-SP). Não editar sem
// re-auditar: `node scripts/seo/audit-vehicle-taxonomy.mjs`.

export const COMMERCIAL_MODEL_FIXTURES = Object.freeze([
  // ── Produção: GM - Chevrolet. Quatro versões FIPE, UMA entidade (Onix). ──
  {
    real: true,
    brand: "GM - Chevrolet",
    model: "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.",
    label: "Onix",
    slug: "onix",
    source: "derived",
  },
  {
    real: true,
    brand: "GM - Chevrolet",
    model: "ONIX HATCH LT 1.0 12V Flex 5p Mec.",
    label: "Onix",
    slug: "onix",
    source: "derived",
  },
  {
    real: true,
    brand: "GM - Chevrolet",
    model: "ONIX SEDAN Plus LTZ 1.0 12V TB Flex Aut.",
    label: "Onix",
    slug: "onix",
    source: "derived",
  },
  {
    real: true,
    brand: "GM - Chevrolet",
    model: "ONIX HATCH 1.0 12V Flex 5p Mec.",
    label: "Onix",
    slug: "onix",
    source: "derived",
  },

  // ── Produção: Fiat ──
  {
    real: true,
    brand: "Fiat",
    model: "ARGO DRIVE 1.0 6V Flex",
    label: "Argo",
    slug: "argo",
    source: "derived",
  },
  {
    real: true,
    brand: "Fiat",
    model: "MOBI LIKE 1.0 Fire Flex 5p.",
    label: "Mobi",
    slug: "mobi",
    source: "derived",
  },
  {
    real: true,
    brand: "Fiat",
    model: "PULSE DRIVE 1.3 8V Flex Aut.",
    label: "Pulse",
    slug: "pulse",
    source: "derived",
  },
  {
    real: true,
    brand: "Fiat",
    model: "PULSE AUDACE 1.0 Turbo 200 Flex Aut.",
    label: "Pulse",
    slug: "pulse",
    source: "derived",
  },
  {
    real: true,
    brand: "Fiat",
    model: "Strada Endurance 1.4 Flex 8V CS Plus",
    label: "Strada",
    slug: "strada",
    source: "derived",
  },

  // ── Produção: VW - VolksWagen ──
  {
    real: true,
    brand: "VW - VolksWagen",
    model: "Polo Track 1.0 Flex 12V 5p",
    label: "Polo",
    slug: "polo",
    source: "derived",
  },
  {
    real: true,
    brand: "VW - VolksWagen",
    model: "T-Cross 200 TSI 1.0  Flex 12V 5p Aut.",
    label: "T-Cross",
    slug: "t-cross",
    source: "derived",
  },
  {
    real: true,
    brand: "VW - VolksWagen",
    model: "Fox Connect 1.6 Flex 8V 5p",
    label: "Fox",
    slug: "fox",
    source: "derived",
  },
  {
    real: true,
    brand: "VW - VolksWagen",
    model: "VIRTUS 1.6 MSI Flex 16V 4p Aut.",
    label: "Virtus",
    slug: "virtus",
    source: "derived",
  },

  // ── Produção: demais marcas ──
  {
    real: true,
    brand: "Hyundai",
    model: "HB20 Sense Plus 1.0 Flex 12V Mec.",
    label: "HB20",
    slug: "hb20",
    source: "derived",
  },
  {
    real: true,
    brand: "Honda",
    model: "HR-V EXL 1.8 Flexone 16V 5p Aut.",
    label: "HR-V",
    slug: "hr-v",
    source: "derived",
  },
  {
    real: true,
    brand: "Citroën",
    model: "C3 Live Pack 1.0 Flex 6V 5p Mec.",
    label: "C3",
    slug: "c3",
    source: "derived",
  },
  {
    real: true,
    brand: "Renault",
    model: "KWID Zen 1.0 Flex 12V 5p Mec.",
    label: "Kwid",
    slug: "kwid",
    source: "derived",
  },
  {
    real: true,
    brand: "Jeep",
    model: "Renegade Sport 1.8 4x2 Flex 16V Mec.",
    label: "Renegade",
    slug: "renegade",
    source: "derived",
  },

  // ── Produção: o caso que quebra `split(" ")[0]` ──
  // Primeiro token é "5". Sem override, a heurística ingênua criaria a
  // entidade "5" e o H1 "Carros 5 usados em Atibaia".
  {
    real: true,
    brand: "Omoda",
    model: "5 Luxury 1.5 TB FWD",
    label: "Omoda 5",
    slug: "omoda-5",
    source: "override",
  },

  // ── Sintéticos: compostos do mercado BR que a heurística cortaria errado ──
  {
    brand: "Toyota",
    model: "Corolla Cross XRE 2.0 16V Flex Aut.",
    label: "Corolla Cross",
    slug: "corolla-cross",
    source: "compound",
  },
  {
    brand: "Fiat",
    model: "Grand Siena Essence 1.6 Flex 16V 4p",
    label: "Grand Siena",
    slug: "grand-siena",
    source: "compound",
  },
  {
    brand: "Toyota",
    model: "Corolla XEi 2.0 16V Flex Aut.",
    label: "Corolla",
    slug: "corolla",
    source: "derived",
  },

  // ── Sintéticos: modelo numérico com marca (regra do degrau 3) ──
  {
    brand: "Peugeot",
    model: "208 Active 1.6 Flex 16V 5p Aut.",
    label: "Peugeot 208",
    slug: "peugeot-208",
    source: "derived",
  },

  // ── Sintéticos: recusa segura (null) ──
  { brand: "Fiat", model: "", label: null, slug: null, source: null },
  { brand: "Fiat", model: "   ", label: null, slug: null, source: null },
  { brand: null, model: "208 Active 1.6", label: null, slug: null, source: null },
  { brand: "Fiat", model: "1.0 Flex 8V", label: null, slug: null, source: null },
]);
