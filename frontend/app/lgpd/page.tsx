import { permanentRedirect } from "next/navigation";

// Página consolidada na Política de Privacidade. Manter o endereço legado
// somente como redirecionamento permanente para não quebrar links existentes.
export default function LgpdLegacyRedirect() {
  permanentRedirect("/politica-de-privacidade");
}
