/* eslint-disable */
/**
 * One-shot: remove fundo branco/quase-branco das ilustrações da página
 * /tabela-fipe e salva versões transparentes nos caminhos consumidos
 * pelo FipePageClient.tsx.
 *
 * Lê:
 *   public/images/imagem1_pg_fipe.png   → clipboard FIPE
 *   public/images/imagem2_pd_fipe.png   → phone + carro + GRÁTIS
 *
 * Escreve:
 *   public/images/fipe/result-illustration.png
 *   public/images/fipe/anuncie-gratis.png
 *
 * Estratégia: sharp + raw pixel walk. RGB > 250 vira alpha 0; pixels
 * entre 220 e 250 ganham alpha proporcional para preservar
 * anti-aliasing nas bordas (sem halo branco).
 */

const path = require("node:path");
const fs = require("node:fs");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "..");
const IMG_DIR = path.join(ROOT, "public", "images");
const OUT_DIR = path.join(IMG_DIR, "fipe");

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

const TASKS = [
  {
    label: "FIPE clipboard",
    inCandidates: [
      path.join(IMG_DIR, "imagem1_pg_fipe.png"),
      path.join(IMG_DIR, "imagem1_pd_fipe.png"),
    ],
    out: path.join(OUT_DIR, "result-illustration.png"),
  },
  {
    label: "Anuncie grátis (phone + carro)",
    inCandidates: [
      path.join(IMG_DIR, "imagem2_pg_fipe.png"),
      path.join(IMG_DIR, "imagem2_pd_fipe.png"),
    ],
    out: path.join(OUT_DIR, "anuncie-gratis.png"),
  },
];

const HARD = 250; // RGB ≥ HARD → totalmente transparente
const SOFT = 220; // RGB entre SOFT..HARD → alpha proporcional (anti-alias)

/**
 * Largura de saída em pixels. As ilustrações da FIPE renderizam no
 * máximo a ~310px no card de resultado / banner Anuncie em desktop.
 * 2× isso (620px) cobre dispositivos Retina sem inflar o bundle.
 */
const OUTPUT_WIDTH = 620;

async function processOne({ label, inCandidates, out }) {
  const inPath = inCandidates.find((p) => fs.existsSync(p));
  if (!inPath) {
    console.error(`[skip] ${label}: nenhum dos arquivos existe → ${inCandidates.join(" | ")}`);
    return;
  }

  // Resize para tamanho web-ótimo antes de mexer no alpha — reduz o
  // PNG final de ~2MB para ~150-300KB sem perda visível.
  const img = sharp(inPath)
    .resize({ width: OUTPUT_WIDTH, withoutEnlargement: true })
    .ensureAlpha();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const buf = Buffer.from(data);

  if (info.channels !== 4) {
    throw new Error(`Esperava 4 canais (RGBA), recebi ${info.channels} em ${inPath}`);
  }

  let removed = 0;
  let feathered = 0;
  const total = buf.length / 4;

  for (let i = 0; i < buf.length; i += 4) {
    const r = buf[i];
    const g = buf[i + 1];
    const b = buf[i + 2];
    const minRgb = Math.min(r, g, b);

    if (minRgb >= HARD) {
      buf[i + 3] = 0;
      removed++;
    } else if (minRgb >= SOFT) {
      const factor = (minRgb - SOFT) / (HARD - SOFT); // 0..1
      buf[i + 3] = Math.round(buf[i + 3] * (1 - factor));
      feathered++;
    }
  }

  await sharp(buf, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(out);

  const pct = (n) => ((n / total) * 100).toFixed(1);
  console.log(
    `[ok] ${label}\n  in : ${path.relative(ROOT, inPath)} (${info.width}×${info.height})\n  out: ${path.relative(ROOT, out)}\n  hard transparent: ${removed} (${pct(removed)}%)\n  feathered      : ${feathered} (${pct(feathered)}%)`
  );
}

(async () => {
  for (const task of TASKS) {
    try {
      await processOne(task);
    } catch (err) {
      console.error(`[fail] ${task.label}:`, err.message);
      process.exitCode = 1;
    }
  }
})();
