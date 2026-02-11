function generateCityPost(cityName) {
  const templates = [
    `🚗 Carros à venda em ${cityName}!

Confira as melhores ofertas de veículos usados na sua cidade.
Acesse agora:
https://carrosnacidade.com/${slugify(cityName)}`,

    `Procurando carro em ${cityName}? 👀

Veja os veículos disponíveis perto de você:
https://carrosnacidade.com/${slugify(cityName)}`,

    `📍 ${cityName} tem carros disponíveis para venda!

Encontre ofertas locais e fale direto com o vendedor:
https://carrosnacidade.com/${slugify(cityName)}`,
  ];

  const index = Math.floor(Math.random() * templates.length);
  return templates[index];
}

function slugify(text) {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

module.exports = { generateCityPost };
