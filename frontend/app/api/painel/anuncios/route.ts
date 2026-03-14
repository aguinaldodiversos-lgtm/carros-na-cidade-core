import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NormalizedPayload = {
  sellerType: string;
  brand: string;
  model: string;
  version: string;
  yearModel: string;
  mileage: string;
  price: string;
  fipeValue: string;
  city: string;
  state: string;
  fuel: string;
  transmission: string;
  bodyStyle: string;
  color: string;
  plateFinal: string;
  title: string;
  description: string;
  whatsapp: string;
  phone: string;
  acceptTerms: boolean;
  photoCount: number;
};

function firstText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function toBoolean(value: string) {
  return value === "true" || value === "1" || value === "on";
}

function normalizePath(path: string) {
  if (!path) return "";
  return path.startsWith("/") ? path : `/${path}`;
}

function buildNormalizedPayload(source: FormData): NormalizedPayload {
  const photos = source
    .getAll("photos")
    .filter((item): item is File => item instanceof File && item.size > 0);

  return {
    sellerType: firstText(source, "sellerType") || "particular",
    brand: firstText(source, "brand"),
    model: firstText(source, "model"),
    version: firstText(source, "version"),
    yearModel: firstText(source, "yearModel"),
    mileage: firstText(source, "mileage"),
    price: firstText(source, "price"),
    fipeValue: firstText(source, "fipeValue"),
    city: firstText(source, "city"),
    state: firstText(source, "state"),
    fuel: firstText(source, "fuel"),
    transmission: firstText(source, "transmission"),
    bodyStyle: firstText(source, "bodyStyle"),
    color: firstText(source, "color"),
    plateFinal: firstText(source, "plateFinal"),
    title: firstText(source, "title"),
    description: firstText(source, "description"),
    whatsapp: firstText(source, "whatsapp"),
    phone: firstText(source, "phone"),
    acceptTerms: toBoolean(firstText(source, "acceptTerms")),
    photoCount: photos.length,
  };
}

function buildMultipartPayload(source: FormData) {
  const normalized = buildNormalizedPayload(source);
  const output = new FormData();

  output.append("sellerType", normalized.sellerType);
  output.append("seller_type", normalized.sellerType);

  output.append("brand", normalized.brand);
  output.append("model", normalized.model);
  output.append("version", normalized.version);

  output.append("yearModel", normalized.yearModel);
  output.append("year_model", normalized.yearModel);

  output.append("mileage", normalized.mileage);
  output.append("price", normalized.price);

  output.append("fipeValue", normalized.fipeValue);
  output.append("fipe_value", normalized.fipeValue);

  output.append("city", normalized.city);
  output.append("state", normalized.state);
  output.append("fuel", normalized.fuel);
  output.append("transmission", normalized.transmission);

  output.append("bodyStyle", normalized.bodyStyle);
  output.append("body_style", normalized.bodyStyle);

  output.append("color", normalized.color);

  output.append("plateFinal", normalized.plateFinal);
  output.append("plate_final", normalized.plateFinal);

  output.append("title", normalized.title);
  output.append("description", normalized.description);
  output.append("whatsapp", normalized.whatsapp);
  output.append("phone", normalized.phone);

  output.append("acceptTerms", normalized.acceptTerms ? "true" : "false");
  output.append("accept_terms", normalized.acceptTerms ? "true" : "false");

  output.append("payload", JSON.stringify(normalized));
  output.append("data", JSON.stringify(normalized));

  const photos = source
    .getAll("photos")
    .filter((item): item is File => item instanceof File && item.size > 0);

  photos.forEach((file, index) => {
    const fileName = file.name || `foto-${index + 1}.jpg`;
    output.append("photos", file, fileName);
  });

  return output;
}

function buildJsonPayload(source: FormData) {
  return buildNormalizedPayload(source);
}

function getBaseUrls() {
  return Array.from(
    new Set(
      [process.env.API_URL, process.env.NEXT_PUBLIC_API_URL]
        .filter(Boolean)
        .map((item) => String(item).replace(/\/$/, ""))
    )
  );
}

function getCandidatePaths() {
  const configured = process.env.ADS_CREATE_PATH?.trim();

  if (configured) {
    return [normalizePath(configured)];
  }

  return [
    "/ads",
    "/api/ads",
    "/public/ads",
    "/dashboard/ads",
    "/dealership/ads",
  ];
}

function buildForwardHeaders(request: NextRequest) {
  const headers: HeadersInit = {
    Accept: "application/json",
  };

  const authorization = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");

  if (authorization) {
    headers.Authorization = authorization;
  }

  if (cookie) {
    headers.Cookie = cookie;
  }

  return headers;
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return { message: "Resposta JSON inválida do backend." };
    }
  }

  const text = await response.text();
  return { message: text || "Resposta sem conteúdo." };
}

export async function POST(request: NextRequest) {
  try {
    const source = await request.formData();
    const bases = getBaseUrls();
    const candidatePaths = getCandidatePaths();

    if (!bases.length) {
      return NextResponse.json(
        {
          ok: false,
          message: "API_URL ou NEXT_PUBLIC_API_URL não está configurada no frontend.",
        },
        { status: 500 }
      );
    }

    const headers = buildForwardHeaders(request);
    const multipartPayload = buildMultipartPayload(source);
    const jsonPayload = buildJsonPayload(source);

    const errors: Array<{
      url: string;
      mode: "multipart" | "json";
      status?: number;
      message: string;
    }> = [];

    for (const base of bases) {
      for (const path of candidatePaths) {
        const url = `${base}${path}`;

        try {
          const response = await fetch(url, {
            method: "POST",
            headers,
            body: multipartPayload,
            cache: "no-store",
          });

          const parsed = await parseResponse(response);

          if (response.ok) {
            return NextResponse.json(
              {
                ok: true,
                message:
                  typeof parsed?.message === "string"
                    ? parsed.message
                    : "Anúncio enviado com sucesso.",
                result: parsed,
              },
              { status: 200 }
            );
          }

          errors.push({
            url,
            mode: "multipart",
            status: response.status,
            message:
              typeof parsed?.message === "string"
                ? parsed.message
                : `Falha no backend com status ${response.status}.`,
          });
        } catch (error) {
          errors.push({
            url,
            mode: "multipart",
            message: error instanceof Error ? error.message : "Erro inesperado no envio multipart.",
          });
        }

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              ...headers,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(jsonPayload),
            cache: "no-store",
          });

          const parsed = await parseResponse(response);

          if (response.ok) {
            return NextResponse.json(
              {
                ok: true,
                message:
                  typeof parsed?.message === "string"
                    ? parsed.message
                    : "Anúncio enviado com sucesso.",
                result: parsed,
              },
              { status: 200 }
            );
          }

          errors.push({
            url,
            mode: "json",
            status: response.status,
            message:
              typeof parsed?.message === "string"
                ? parsed.message
                : `Falha no backend com status ${response.status}.`,
          });
        } catch (error) {
          errors.push({
            url,
            mode: "json",
            message: error instanceof Error ? error.message : "Erro inesperado no envio JSON.",
          });
        }
      }
    }

    return NextResponse.json(
      {
        ok: false,
        message: "Não foi possível publicar o anúncio no backend.",
        attempts: errors,
      },
      { status: 502 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Erro inesperado ao processar o anúncio.",
      },
      { status: 500 }
    );
  }
}
