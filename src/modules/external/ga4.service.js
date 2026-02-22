// src/modules/external/ga4.service.js

import { google } from "googleapis";

export async function fetchGA4CityData(propertyId) {
  const auth = new google.auth.GoogleAuth({
    keyFile: "google-service-account.json",
    scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
  });

  const client = await auth.getClient();

  const analyticsData = google.analyticsdata({
    version: "v1beta",
    auth: client,
  });

  const response = await analyticsData.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dimensions: [{ name: "city" }],
      metrics: [
        { name: "sessions" },
        { name: "conversions" }
      ],
      dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
    },
  });

  return response.data.rows || [];
}
