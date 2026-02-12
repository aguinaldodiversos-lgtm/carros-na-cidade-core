const { Pool } = require("pg");
const { getCompanyByCnpj } = require("./openCnpjClient.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const TARGET_CNAES = [
  "4511101", // carros usados
  "4511102", // carros novos
  "4511103", // representação
  "4541203", // motos usadas
];

function isVehicleDealer(company) {
  if (!company) return false;

  const main = company.cnae_principal;
  const secondary = company.cnaes_secundarios || [];

  if (TARGET_CNAES.includes(main)) {
    return true;
  }

  for (const cnae of secondary) {
    if (TARGET_CNAES.includes(cnae)) {
      return true;
    }
  }

  return false;
}

function extractPhone(company) {
  if (!company.telefones || company.telefones.length === 0) {
    return null;
  }

  const phone = company.telefones[0];
  return `55${phone.ddd}${phone.numero}`;
}

async function leadExists(cnpj) {
  const result = await pool.query(
    `
    SELECT id
    FROM dealer_leads
    WHERE cnpj = $1
    LIMIT 1
  `,
    [cnpj]
  );

  return result.rowCount > 0;
}

async function insertLead(company, cityId) {
  const phone = extractPhone(company);
  if (!phone) return;

  if (await leadExists(company.cnpj)) return;

  const address = `${company.logradouro || ""}, ${company.numero || ""} - ${company.bairro || ""}`;

  await pool.query(
    `
    INSERT INTO dealer_leads (
      name,
      company_name,
      phone,
      cnpj,
      cnae,
      address,
      source,
      source_detail,
      city_id
    )
    VALUES ($1,$2,$3,$4,$5,$6,'opencnpj','api',$7)
  `,
    [
      company.nome_fantasia || company.razao_social,
      company.razao_social,
      phone,
      company.cnpj,
      company.cnae_principal,
      address,
      cityId,
    ]
  );
}

async function processCnpj(cnpj, cityId) {
  const company = await getCompanyByCnpj(cnpj);

  if (!company) return;

  if (company.situacao_cadastral !== "Ativa") return;

  if (!isVehicleDealer(company)) return;

  await insertLead(company, cityId);
}

module.exports = { processCnpj };
