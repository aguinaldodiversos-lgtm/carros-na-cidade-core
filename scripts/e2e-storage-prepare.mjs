#!/usr/bin/env node
/**
 * Prepara o object storage de TESTE (BUG-ENV-01).
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 * O fluxo crítico do portal (wizard → upload → publicação) depende de storage
 * S3/R2: o backend recusa publicar anúncio cujas fotos não consegue confirmar,
 * e o BFF só aceita referências vindas do upload do Step 2. Sem storage, o
 * `full-flow` executa até o fim e reprova em 400 — corretamente.
 *
 * Este script deixa o MinIO do `docker-compose.test.yml` pronto: espera o
 * serviço responder e garante o bucket de E2E.
 *
 * ── Por que usa o MESMO SDK do produto ──────────────────────────────────────
 * Criar o bucket com `mc` (CLI do MinIO) exigiria outra imagem e provaria
 * apenas que o `mc` funciona. Usando `@aws-sdk/client-s3` com as MESMAS
 * variáveis que `src/infrastructure/storage/r2.service.js` lê, a preparação já
 * exercita o caminho real: endpoint customizado, `forcePathStyle`, assinatura
 * SigV4 e credenciais. Se este script cria o bucket, o adapter do produto vai
 * conseguir falar com o storage.
 *
 * Uso:
 *   node scripts/e2e-storage-prepare.mjs          # espera + cria bucket
 *   node scripts/e2e-storage-prepare.mjs --print  # só imprime o bloco de env
 */
import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

/**
 * Valores canônicos do ambiente de teste. Sintéticos, versionados de propósito:
 * são o contrato entre o compose, o backend local, o Playwright e o CI. Não há
 * segredo aqui — e não pode haver.
 */
export const E2E_STORAGE_ENV = Object.freeze({
  R2_ENDPOINT: "http://127.0.0.1:9000",
  R2_ACCOUNT_ID: "carros-e2e",
  R2_ACCESS_KEY_ID: "carros-e2e-access-key",
  R2_SECRET_ACCESS_KEY: "carros-e2e-secret-key",
  R2_BUCKET_NAME: "carros-e2e-test",
  AWS_REGION: "us-east-1",
  // Base pública do bucket — espelha o CDN que produção usa.
  //
  // Sem ela, `/api/vehicle-images?key=…` responde 302 para
  // `/images/vehicle-placeholder.svg`: a rota foi desenhada para redirecionar
  // ao CDN e, sem base pública, não tem para onde mandar. O anúncio publicava,
  // mas a foto não chegava ao visitante — o E2E terminaria verde com a imagem
  // quebrada, que é o tipo de verde que não vale nada.
  //
  // `NEXT_PUBLIC_*` é o espelho inlined no bundle do client e PRECISA casar
  // com a de servidor (ver .env.example).
  R2_PUBLIC_BASE_URL: "http://127.0.0.1:9000/carros-e2e-test",
  NEXT_PUBLIC_R2_PUBLIC_BASE_URL: "http://127.0.0.1:9000/carros-e2e-test",
});

/**
 * Endpoints aceitos. O storage de teste é destrutivo (cria bucket, apaga
 * objetos); apontar para um endpoint remoto por acidente é o tipo de engano que
 * não pode depender de atenção humana.
 */
const HOSTS_LOCAIS = new Set(["127.0.0.1", "localhost", "0.0.0.0", "::1", "minio_test", "minio"]);

export function assertLocalStorageEndpoint(endpoint) {
  let host = "";
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    throw new Error(`[e2e-storage] R2_ENDPOINT inválido: ${endpoint}`);
  }
  if (!HOSTS_LOCAIS.has(host)) {
    throw new Error(
      `[e2e-storage] Recusando preparar storage em host não-local: ${host}.\n` +
        `Este script CRIA e APAGA objetos. Use o MinIO do docker-compose.test.yml.`
    );
  }
  return host;
}

/** Aplica os valores canônicos ao processo, sem sobrescrever o que já existe. */
export function applyStorageEnv(env = process.env) {
  for (const [chave, valor] of Object.entries(E2E_STORAGE_ENV)) {
    if (!String(env[chave] ?? "").trim()) env[chave] = valor;
  }
  return env;
}

export function buildTestS3Client(env = process.env) {
  return new S3Client({
    region: env.AWS_REGION || "us-east-1",
    endpoint: env.R2_ENDPOINT,
    // Mesmo flag do adapter de produção: R2 exige, MinIO exige.
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espera o MinIO aceitar uma chamada assinada de verdade, não só abrir a porta. */
async function waitForStorage(client, bucket, { tentativas = 40, intervaloMs = 500 } = {}) {
  let ultimoErro = null;
  for (let i = 1; i <= tentativas; i += 1) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { pronto: true, bucketExistia: true, tentativas: i };
    } catch (err) {
      const status = err?.$metadata?.httpStatusCode;
      // 404/NoSuchBucket significa que o SERVIDOR respondeu — é o sinal de
      // prontidão que interessa. O bucket é criado logo abaixo.
      if (status === 404 || err?.name === "NotFound" || err?.name === "NoSuchBucket") {
        return { pronto: true, bucketExistia: false, tentativas: i };
      }
      ultimoErro = err;
      await sleep(intervaloMs);
    }
  }
  throw new Error(
    `[e2e-storage] MinIO não respondeu em ${tentativas} tentativas. ` +
      `Suba com 'npm run integration:db:up'. Último erro: ${ultimoErro?.message ?? "desconhecido"}`
  );
}

export async function ensureTestBucket({ env = process.env, log = console.log } = {}) {
  applyStorageEnv(env);
  const host = assertLocalStorageEndpoint(env.R2_ENDPOINT);
  const bucket = env.R2_BUCKET_NAME;

  const client = buildTestS3Client(env);
  const estado = await waitForStorage(client, bucket);

  if (!estado.bucketExistia) {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    log(`[e2e-storage] bucket criado: ${bucket}`);
  } else {
    log(`[e2e-storage] bucket já existia: ${bucket}`);
  }

  // Leitura anônima — o que o CDN de produção oferece.
  //
  // `R2_PUBLIC_BASE_URL` aponta direto para o bucket, então o navegador busca a
  // foto sem credencial, exatamente como faria no CDN. Sem esta policy o
  // `<img>` receberia 403 e a página pública mostraria imagem quebrada.
  //
  // O escopo é `GetObject` no bucket de TESTE, num MinIO local. Nada aqui toca
  // bucket real: `assertLocalStorageEndpoint` já barrou host remoto acima.
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      }),
    })
  );

  // Prova de que o bucket é utilizável pelo mesmo caminho do produto: uma
  // listagem assinada. "CreateBucket devolveu 200" não prova leitura.
  const listagem = await client.send(new ListObjectsV2Command({ Bucket: bucket, MaxKeys: 1 }));

  log(
    `[e2e-storage] OK — endpoint=${env.R2_ENDPOINT} (host ${host}) bucket=${bucket} ` +
      `region=${env.AWS_REGION} objetos=${listagem.KeyCount ?? 0}`
  );

  client.destroy?.();
  return { bucket, endpoint: env.R2_ENDPOINT, criado: !estado.bucketExistia };
}

/** Bloco pronto para exportar ao subir a API local. */
export function printEnvBlock(log = console.log) {
  log("# Storage de teste — exporte antes de 'npm run dev' (API Express):");
  for (const [chave, valor] of Object.entries(E2E_STORAGE_ENV)) {
    log(`export ${chave}=${valor}`);
  }
}

const executadoDiretamente =
  process.argv[1] &&
  process.argv[1].replace(/\\/g, "/").endsWith("scripts/e2e-storage-prepare.mjs");

if (executadoDiretamente) {
  if (process.argv.includes("--print")) {
    printEnvBlock();
  } else {
    await ensureTestBucket();
    printEnvBlock();
  }
}
