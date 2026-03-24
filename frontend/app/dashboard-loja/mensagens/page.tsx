import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mensagens",
  description: "Central de mensagens da loja.",
};

export default function LojaMensagensPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-extrabold text-[#0f172a]">Mensagens</h1>
      <p className="text-sm text-[#64748b]">
        Em breve você poderá acompanhar conversas com interessados diretamente por aqui.
      </p>
      <div className="rounded-2xl border border-dashed border-[#cfd8e8] bg-white p-10 text-center text-sm text-[#94a3b8]">
        Nenhuma mensagem no momento.
      </div>
    </div>
  );
}
