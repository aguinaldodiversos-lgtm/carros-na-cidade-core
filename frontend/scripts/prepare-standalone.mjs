import path from "node:path";
import { fileURLToPath } from "node:url";
import { access, constants, cp, mkdir, rm } from "node:fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const nextDir = path.join(rootDir, ".next");
const standaloneDir = path.join(nextDir, "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");

const publicDir = path.join(rootDir, "public");
const staticDir = path.join(nextDir, "static");

const standalonePublicDir = path.join(standaloneDir, "public");
const standaloneStaticDir = path.join(standaloneNextDir, "static");

async function exists(targetPath) {
  try {
    await access(targetPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(targetPath) {
  await mkdir(targetPath, { recursive: true });
}

async function cleanDir(targetPath) {
  await rm(targetPath, { recursive: true, force: true });
}

async function copyDir(source, destination, options = {}) {
  const { required = true } = options;

  const sourceExists = await exists(source);
  if (!sourceExists) {
    if (required) {
      throw new Error(`Diretório obrigatório não encontrado: ${source}`);
    }
    return false;
  }

  await cleanDir(destination);
  await ensureDir(path.dirname(destination));

  await cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
    preserveTimestamps: true,
  });

  return true;
}

async function main() {
  const standaloneExists = await exists(standaloneDir);
  if (!standaloneExists) {
    throw new Error(
      "Build standalone não encontrado. Verifique se o frontend está com output: 'standalone' e se o next build concluiu com sucesso."
    );
  }

  await ensureDir(standaloneNextDir);

  const copiedPublic = await copyDir(publicDir, standalonePublicDir, {
    required: false,
  });

  await copyDir(staticDir, standaloneStaticDir, {
    required: true,
  });

  console.log("✅ Standalone preparado com sucesso.");
  console.log(`- standalone: ${standaloneDir}`);
  console.log(`- public copiado: ${copiedPublic ? "sim" : "não"}`);
  console.log("- .next/static copiado: sim");
}

main().catch((error) => {
  console.error("❌ Falha ao preparar o standalone.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
