const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* =====================================================
   PEGAR TEMAS POR CIDADE
===================================================== */
async function getCityTopics() {
  const result = await pool.query(`
    SELECT
      city,
      brand,
      model,
      COUNT(*) AS total_alerts
    FROM alerts
    WHERE brand IS NOT NULL
      AND model IS NOT NULL
    GROUP BY city, brand, model
    ORDER BY total_alerts DESC
    LIMIT 20
  `);

  return result.rows;
}

/* =====================================================
   GERAR PAUTA
===================================================== */
function generateTopicIdeas(data) {
  const topics = [];

  data.forEach((item) => {
    const city = item.city;
    const brand = item.brand;
    const model = item.model;

    topics.push({
      city,
      title: `Vale a pena comprar um ${brand} ${model} em ${city}?`,
    });

    topics.push({
      city,
      title: `Melhores carros usados em ${city} em 2026`,
    });

    topics.push({
      city,
      title: `Carros até R$40.000 em ${city}: veja as melhores opções`,
    });
  });

  return topics;
}

/* =====================================================
   GERAR CONTEÚDO SIMPLES
===================================================== */
function generateArticleContent(topic) {
  return `
<h1>${topic.title}</h1>

<p>Se você está procurando um carro em ${topic.city}, este guia vai ajudar você a escolher a melhor opção.</p>

<h2>Por que comprar um carro em ${topic.city}?</h2>
<p>O mercado de veículos usados em ${topic.city} tem crescido, com boas oportunidades para quem busca economia e praticidade.</p>

<h2>Dicas antes de comprar</h2>
<ul>
<li>Verifique o histórico do veículo</li>
<li>Faça uma vistoria completa</li>
<li>Compare preços na sua cidade</li>
</ul>

<p>Veja as ofertas disponíveis agora:</p>
<p><a href="/carros/${topic.city.toLowerCase()}">Ver carros em ${topic.city}</a></p>
`;
}

/* =====================================================
   SALVAR POST
===================================================== */
async function savePost(city, title, content) {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "-");

  await pool.query(
    `
    INSERT INTO blog_posts (city, title, slug, content)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (slug) DO NOTHING
  `,
    [city, title, slug, content]
  );
}

/* =====================================================
   EXECUTAR MOTOR SEO
===================================================== */
async function runSeoEngine() {
  console.log("📝 SEO engine rodando...");

  const data = await getCityTopics();
  const topics = generateTopicIdeas(data);

  for (const topic of topics.slice(0, 5)) {
    const content = generateArticleContent(topic);
    await savePost(topic.city, topic.title, content);

    console.log("📰 Artigo criado:", topic.title);
  }
}

module.exports = { runSeoEngine };
