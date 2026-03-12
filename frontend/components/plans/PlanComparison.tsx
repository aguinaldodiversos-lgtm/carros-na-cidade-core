const rows = [
  {
    feature: "Modelo de monetização",
    carrosNaCidade: "Plano e impulsionamento com valor previsível",
    outras: "Custos difusos ou comissão sobre venda",
  },
  {
    feature: "Capacidade de publicação",
    carrosNaCidade: "CPF: 3 grátis | CNPJ: 20 grátis + upgrades",
    outras: "Menos clareza de limite e progressão",
  },
  {
    feature: "Impulsionamento",
    carrosNaCidade: "Ativação pontual para anúncio ou plano mensal de loja",
    outras: "Pacotes rígidos e pouco conectados ao painel",
  },
  {
    feature: "Leads e contato",
    carrosNaCidade: "Contato direto + fluxo oficial do portal",
    outras: "Contato muitas vezes intermediado ou opaco",
  },
  {
    feature: "Ativação do lojista",
    carrosNaCidade: "Plano, dashboard e impulso no mesmo funil",
    outras: "Fluxos quebrados entre catálogo, cobrança e operação",
  },
];

export default function PlanComparison() {
  return (
    <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-4 shadow-[0_2px_16px_rgba(10,20,40,0.05)] sm:p-5">
      <h2 className="text-[24px] font-extrabold leading-tight text-[#1d2538] sm:text-2xl">
        O plano precisa liberar operação, não só cobrar assinatura.
      </h2>

      <div className="mt-4 space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={row.feature} className="rounded-xl border border-[#e1e5ef] bg-[#f8fafe] p-3">
            <h3 className="text-sm font-extrabold text-[#24324d]">{row.feature}</h3>
            <div className="mt-2 grid gap-2 text-sm">
              <p className="rounded-lg bg-[#eaf2ff] px-2 py-2 text-[#1f2f4e]">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-[#0e62d8]">Carros na Cidade</span>
                {row.carrosNaCidade}
              </p>
              <p className="rounded-lg bg-[#f2f4f9] px-2 py-2 text-[#5e6780]">
                <span className="block text-[11px] font-bold uppercase tracking-wide text-[#6a748b]">Outras plataformas</span>
                {row.outras}
              </p>
            </div>
          </article>
        ))}
      </div>

      <div className="mt-4 hidden overflow-x-auto md:block">
        <table className="min-w-full overflow-hidden rounded-xl border border-[#e1e5ef]">
          <thead className="bg-[#f3f6fc]">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#5f6980]">Comparativo</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#0e62d8]">Carros na Cidade</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-[#5f6980]">Outras plataformas</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature} className="border-t border-[#e1e5ef]">
                <td className="px-4 py-3 text-sm font-semibold text-[#24324d]">{row.feature}</td>
                <td className="px-4 py-3 text-sm text-[#1f2f4e]">{row.carrosNaCidade}</td>
                <td className="px-4 py-3 text-sm text-[#5e6780]">{row.outras}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
