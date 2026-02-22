import { google } from "googleapis";

export async function fetchSearchConsoleData(siteUrl) {
  const auth = new google.auth.GoogleAuth({
    keyFile: "google-service-account.json",
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });

  const client = await auth.getClient();

  const webmasters = google.webmasters({ version: "v3", auth: client });

  const response = await webmasters.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate: "2024-01-01",
      endDate: "2024-12-31",
      dimensions: ["page"],
    },
  });

  return response.data.rows || [];
}
