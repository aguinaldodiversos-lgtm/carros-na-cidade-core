import path from "node:path";
import { fileURLToPath } from "node:url";
import { access, constants, readdir } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const nextDir = path.join(rootDir, ".next");
const standaloneDir = path.join(nextDir, "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");

const checks = [
  {
    label: "server standalone",
    path: path.join(standaloneDir, "server.js"),
    required: true,
  },
  {
    label: "diretório standalone public",
    path: path.join(standaloneDir, "public"),
    required: false,
  },
  {
    label: "diretório standalone .next/static",
    path: path.join(standaloneNextDir, "static"),
    required: true,
  },
  {
    label: "diretório build css",
    path: path.join(nextDir, "static", "css"),
    required: true,
  },
  {
    label: "diretório standalone css",
    path: path.join(standaloneNextDir, "static", "css"),
    required: true,
  },
];

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function getFileCount(targetPath) {
  try {
    const entries = await readdir(targetPath);
    return entries.length;
  } catch {
    return 0;
  }
}

async function run() {
  let hasError = false;

  console.log("🔎 Verificando standalone do frontend...\n");

  for (const check of checks) {
    const ok = await exists(check.path);

    if (!ok && check.required) {
      hasError = true;
      console.error(`❌ ${check.label}: ausente`);
      console.error(`   ${check.path}`);
      continue;
    }

    if (!ok && !check.required) {
      console.warn(`⚠️ ${check.label}: ausente (opcional)`);
      console.warn(`   ${check.path}`);
      continue;
    }

    console.log(`✅ ${check.label}: ok`);
  }

  const buildCssDir = path.join(nextDir, "static", "css");
  const standaloneCssDir = path.join(standaloneNextDir, "static", "css");

  const buildCssCount = await getFileCount(buildCssDir);
  const standaloneCssCount = await getFileCount(standaloneCssDir);

  if (buildCssCount === 0) {
    hasError = true;
    console.error("\n❌ Nenhum arquivo CSS foi gerado em .next/static/css");
  } else {
    console.log(`\n✅ CSS gerado no build: ${buildCssCount} arquivo(s)`);
  }

  if (standaloneCssCount === 0) {
    hasError = true;
    console.error("❌ Nenhum arquivo CSS foi copiado para o standalone");
  } else {
    console.log(`✅ CSS copiado para standalone: ${standaloneCssCount} arquivo(s)`);
  }

  const criticalAssets = [
    "favicon.ico",
    path.join("images", "logo.png"),
    path.join("images", "hero.jpeg"),
  ];

  console.log("\n🔎 Verificando assets críticos...\n");

  for (const relativeAsset of criticalAssets) {
    const sourceAsset = path.join(rootDir, "public", relativeAsset);
    const destinationAsset = path.join(standaloneDir, "public", relativeAsset);

    const sourceExists = await exists(sourceAsset);

    if (!sourceExists) {
      console.warn(`⚠️ Asset não encontrado em public: ${relativeAsset}`);
      continue;
    }

    const destinationExists = await exists(destinationAsset);

    if (!destinationExists) {
      hasError = true;
      console.error(`❌ Asset não copiado para standalone: ${relativeAsset}`);
      continue;
    }

    console.log(`✅ Asset copiado: ${relativeAsset}`);
  }

  if (hasError) {
    console.error("\n❌ Verificação do standalone falhou.");
    process.exit(1);
  }

  console.log("\n✅ Verificação do standalone concluída com sucesso.");
}

run().catch((error) => {
  console.error("❌ Erro ao verificar standalone.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
