import { google } from "googleapis";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getGoogleAuth(scopes) {
  return new google.auth.GoogleAuth({
    keyFile: path.join(
      __dirname,
      "../../credentials/google-service-account.json"
    ),
    scopes,
  });
}
