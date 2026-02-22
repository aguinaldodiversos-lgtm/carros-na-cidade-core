import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(
  __dirname,
  "../credentials/google-service-account.json"
);

async function testSearchConsole() {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: keyPath,
      scopes: [
        "https://www.googleapis.com/auth/webmasters.readonly",
      ],
    });

    const authClient = await auth.getClient();

    const searchconsole = google.searchconsole({
      version: "v1",
      auth: authClient,
    });

    const response = await searchconsole.sites.list();

    console.log("✅ Search Console conectado com sucesso!");
    console.log(response.data);
  } catch (error) {
    console.error("❌ Erro na conexão:", error.response?.data || error.message);
  }
}

testSearchConsole();
