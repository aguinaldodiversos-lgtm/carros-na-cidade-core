// frontend/lib/api.ts

export async function fetchHomeData() {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/public/home`,
    { cache: "no-store" }
  );

  if (!res.ok) {
    throw new Error("Erro ao carregar home");
  }

  return res.json();
}
