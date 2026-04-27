/**
 * Extrai uma imagem de banner limpa a partir do sprite
 * `public/images/banner-e-icones.png` (1024x1536) enviado pelo usuário.
 *
 * Como a parte do banner no sprite tem texto sobreposto à esquerda
 * (pílula "Alibaia c regiso", H1 "Encontre oportunidades", CTA "Ver
 * ofertas") com OCR distorcido (artefato AI), recortamos apenas a
 * região que mostra o carro + cidade limpos no lado direito do banner.
 *
 * Ainda preservamos um pouco do lado esquerdo para o gradient navy
 * que aparece em sobreposição na Home — mas sem o texto AI quebrado.
 */
import sharp from "sharp";

const SRC = "public/images/banner-e-icones.png";
const OUT_BANNER = "public/images/home-hero-banner.png";

// Estimativas baseadas em 1024x1536 — ajuste manual se necessário.
// O banner card no sprite começa por volta de y=200 e termina por volta
// de y=540. O carro ocupa a metade direita do banner (x≈420..984).
// Recortamos um pouco antes do carro p/ permitir gradient suave.

async function run() {
  const meta = await sharp(SRC).metadata();
  console.log(`Sprite: ${meta.width}x${meta.height}`);

  // Banner: corte horizontal mostrando carro + cidade.
  // O banner card no sprite tem cantos arredondados (~12px). Mantemos
  // o crop INSIDE da curva para não pegar triângulos brancos:
  //   x: depois do texto AI quebrado (455) até antes da curva direita
  //      (965).
  //   y: depois da curva superior (225) até antes da inferior (525).
  const left = 460;
  const top = 225;
  const width = 490;
  const height = 295;

  await sharp(SRC)
    .extract({ left, top, width, height })
    .resize({ width: 1440, height: 840, fit: "cover", position: "right" })
    .png({ quality: 90, compressionLevel: 9 })
    .toFile(OUT_BANNER);

  console.log(`✅ Banner limpo gravado em ${OUT_BANNER}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
