import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const keyPath = path.join(
  __dirname,
  "../../credentials/google-service-account.json"
);

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

const auth = new google.auth.GoogleAuth({
  keyFile: keyPath,
  scopes: SCOPES,
});

export async function getSearchConsoleClient() {
  const authClient = await auth.getClient();
  return google.searchconsole({
    version: "v1",
    auth: authClient,
  });
}

export async function getAnalyticsClient() {
  const authClient = await auth.getClient();
  return google.analyticsdata({
    version: "v1beta",
    auth: authClient,
  });
}
