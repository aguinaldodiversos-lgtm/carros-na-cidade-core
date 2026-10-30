import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { applyBffCookies, authenticateBffRequest } from "@/lib/http/bff-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const auth = await authenticateBffRequest(request);
  if (!auth.ok) return auth.response;

  const sourceOrigin = request.headers.get("origin");
  if (sourceOrigin && sourceOrigin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  const photo = form?.get("photo");
  if ((kind !== "cover" && kind !== "logo") || !(photo instanceof File)) {
    return NextResponse.json({ error: "Selecione uma imagem da fachada ou logotipo." }, { status: 400 });
  }
  if (!ALLOWED.has(photo.type) || !photo.size || photo.size > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "Envie JPG, PNG ou WebP de até 6 MB." }, { status: 400 });
  }

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    return NextResponse.json({ error: "Armazenamento de imagens indisponível." }, { status: 503 });
  }

  try {
    const input = Buffer.from(await photo.arrayBuffer());
    const meta = await sharp(input).metadata();
    if (!meta.width || !meta.height || meta.width > 8000 || meta.height > 8000) {
      return NextResponse.json({ error: "Dimensões de imagem inválidas." }, { status: 400 });
    }

    const converted = await sharp(input)
      .rotate()
      .resize(kind === "cover" ? { width: 1600, height: 900, fit: "inside", withoutEnlargement: true } :
        { width: 512, height: 512, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();

    const userHash = crypto.createHash("sha256").update(String(auth.ctx.session.id)).digest("hex").slice(0, 20);
    const key = "dealers/" + userHash + "/" + kind + "/" + crypto.randomUUID() + ".webp";
    const client = new S3Client({
      region: process.env.AWS_REGION || "auto",
      endpoint: process.env.R2_ENDPOINT || "https://" + accountId + ".r2.cloudflarestorage.com",
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    await client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: converted,
      ContentType: "image/webp",
      ContentLength: converted.length,
      CacheControl: "public, max-age=31536000, immutable",
    }));

    const url = "/api/vehicle-images?key=" + encodeURIComponent(key);
    return applyBffCookies(NextResponse.json({ success: true, url }), auth.ctx);
  } catch (error) {
    console.error("[store-media] falha de upload", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Não foi possível enviar a imagem." }, { status: 502 });
  }
}
