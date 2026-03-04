import Link from "next/link";

type VehicleActionsProps = {
  vehicleId: string;
  vehicleName: string;
  whatsappPhone: string;
};

export default function VehicleActions({ vehicleId, vehicleName, whatsappPhone }: VehicleActionsProps) {
  const waText = encodeURIComponent(`Ola, tenho interesse no veiculo ${vehicleName}`);
  const waLink = `https://wa.me/${whatsappPhone}?text=${waText}`;
  const financeLink = `/simulador-financiamento?veiculo=${vehicleId}`;

  return (
    <>
      <section className="hidden rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-[0_2px_16px_rgba(10,20,40,0.05)] md:block">
        <h2 className="text-xl font-extrabold text-[#1d2538]">Fale com o anunciante</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Link
            href={financeLink}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-4 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(14,98,216,0.25)] transition hover:brightness-110"
          >
            Simular financiamento
          </Link>
          <Link
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1fa855] px-4 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(31,168,85,0.25)] transition hover:brightness-110"
          >
            Falar no WhatsApp
          </Link>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[#d8dfeb] bg-white/95 p-3 shadow-[0_-10px_30px_rgba(16,28,58,0.14)] backdrop-blur md:hidden">
        <div className="mx-auto grid w-full max-w-7xl grid-cols-[1fr_1.25fr] gap-2">
          <Link
            href={financeLink}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] px-3 text-[14px] font-bold text-white"
          >
            Simular
          </Link>
          <Link
            href={waLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#1fa855] px-3 text-[15px] font-bold text-white shadow-[0_10px_20px_rgba(31,168,85,0.2)]"
          >
            WhatsApp
          </Link>
        </div>
      </div>
    </>
  );
}
