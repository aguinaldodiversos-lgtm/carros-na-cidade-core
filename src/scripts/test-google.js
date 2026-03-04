<<<<<<< Updated upstream
<<<<<<< Updated upstream
import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
=======
const { google } = require("googleapis");
const path = require("path");
>>>>>>> Stashed changes
=======
const { google } = require("googleapis");
const path = require("path");
>>>>>>> Stashed changes

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
<<<<<<< Updated upstream
<<<<<<< Updated upstream
    console.error("❌ Erro na conexão:", error.response?.data || error.message);
  }
}

testSearchConsole();
=======
=======
>>>>>>> Stashed changes
    console.error("❌ Erro:", error.response?.data || error.message);
  }
}

<<<<<<< Updated upstream
testSearchConsole();
>>>>>>> Stashed changes
=======
testSearchConsole();
>>>>>>> Stashed changes
