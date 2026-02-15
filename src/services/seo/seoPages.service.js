const { gerarConteudoSEO } = require("../seoAI.service");

async function garantirSEO(cidade, db) {
  const paginas = [
    `carros-em-${cidade.slug}`,
    `carros-baratos-em-${cidade.slug}`,
    `carros-ate-30-mil-em-${cidade.slug}`,
    `carros-automaticos-em-${cidade.slug}`,
  ];

  for (const slug of paginas) {
    // Verifica se página já existe
    const existing = await db.query(
      `
      SELECT id FROM seo_pages
      WHERE slug = $1
      LIMIT 1
      `,
      [slug]
    );

    if (existing.rowCount === 0) {
      console.log(`🧠 Gerando SEO para: ${slug}`);

      const conteudo = await gerarConteudoSEO(cidade, slug);

      await db.query(
        `
        INSERT INTO seo_pages (
          city_id,
          slug,
          title,
          content,
          created_at
        )
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [
          cidade.id,
          slug,
          conteudo.title,
          conteudo.content,
        ]
      );
    }
  }
}

module.exports = {
  garantirSEO,
};
