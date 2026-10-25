import type { Metadata } from "next";
import ConfirmEmailPanel from "@/components/auth/ConfirmEmailPanel";

export const metadata: Metadata = {
  title: "Confirmar e-mail",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function ConfirmEmailPage({
  searchParams,
}: {
  searchParams?: { token?: string | string[] };
}) {
  const token = typeof searchParams?.token === "string" ? searchParams.token : "";
  return (
    <main className="min-h-[70vh] bg-[#F6F8FC] px-4 py-12">
      <ConfirmEmailPanel token={token} />
    </main>
  );
}
