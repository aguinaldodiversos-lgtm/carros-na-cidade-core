import { getSearchConsoleClient } from "../infrastructure/google/google.service.js";

async function test() {
  try {
    const client = await getSearchConsoleClient();

    const response = await client.searchanalytics.query({
      siteUrl: "https://carrosnacidade.com/",
      requestBody: {
        startDate: "2026-02-01",
        endDate: "2026-02-20",
        dimensions: ["query"],
      },
    });

    console.log("Search Console conectado com sucesso");
    console.log(response.data);
  } catch (error) {
    console.error("Erro:", error.response?.data || error.message);
  }
}

test();
