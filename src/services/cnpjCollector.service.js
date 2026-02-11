const { Pool } = require("pg");
const { searchCompaniesByCity } = require("./cnpjClient.service");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function insertLead(company, cityId) {
  if (!company.phone) return;

  const exists = await pool.query(
    `
    SELECT id
    FROM dealer_leads
    WHERE cnpj = $1
    LIMIT 1
  `,
    [company.cnpj]
  );

  if (exists.rowCount > 0) return;

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
    VALUES ($1,$2,$3,$4,$5,$6,'cnpj_api',$7,$8)
  `,
    [
      company.trade_name || company.company_name,
      company.company_name,
      company.phone,
      company.cnpj,
      company.cnae,
      company.address,
      "cnpj_api",
      cityId,
    ]
  );
}

async function collectCnpjLeads(cityId, cityName) {
  console.log(`🏢 Coletando CNPJs para ${cityName}`);

  const companies = await searchCompaniesByCity(cityName);

  let inserted = 0;

  for (const company of companies) {
    await insertLead(company, cityId);
    inserted++;
  }

  console.log(`✅ ${inserted} leads CNPJ inseridos`);
}

module.exports = { collectCnpjLeads };
