"use client";

import Link from "next/link";

export default function Hero() {
  return (
    <section className="relative mt-4 overflow-hidden rounded-2xl border border-[#dfe4ee] bg-gradient-to-br from-[#0b1d3a] via-[#0e3266] to-[#1458b8]">
      <div className="relative flex min-h-[360px] flex-col justify-center px-8 py-12 md:min-h-[430px] md:px-14">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22800%22%20height%3D%22500%22%20fill%3D%22none%22%3E%3Ccircle%20cx%3D%22700%22%20cy%3D%22120%22%20r%3D%22250%22%20fill%3D%22white%22%20fill-opacity%3D%220.04%22%2F%3E%3Ccircle%20cx%3D%22650%22%20cy%3D%22400%22%20r%3D%22180%22%20fill%3D%22white%22%20fill-opacity%3D%220.03%22%2F%3E%3C%2Fsvg%3E')] bg-cover bg-center" />

        <div className="relative z-10 text-white">
          <h1 className="max-w-[530px] text-[38px] font-extrabold leading-tight md:text-[56px]">
            Encontre seu próximo carro na sua região
          </h1>
          <p className="mt-3 max-w-[420px] text-[21px] text-white/90 md:text-[31px]">
            Catálogo regional com filtros inteligentes e descoberta local
          </p>
          <Link
            href="/comprar"
            className="mt-7 inline-flex h-14 w-fit items-center rounded-xl bg-white px-8 text-[17px] font-bold text-[#0e62d8] shadow-lg transition hover:bg-slate-50"
          >
            Pesquisar agora
          </Link>
        </div>
      </div>
    </section>
  );
}
