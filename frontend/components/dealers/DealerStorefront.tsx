"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { AdCard } from "@/components/ads/AdCard";
import type { PublicDealer, DealerReview } from "@/lib/dealers/fetch-public-dealer";
import type { AdItem } from "@/lib/search/ads-search";
import { buildPublicTerritoryLabel, buildPublicVehicleHref } from "@/lib/public-contracts";

type Props = { dealer: PublicDealer; ads: AdItem[]; reviews: DealerReview[] };

function categoryOf(ad: AdItem): string {
  const value = String((ad as unknown as { body_type?: string }).body_type || "").toLowerCase();
  if (/suv|utilit/.test(value)) return "SUV";
  if (/hatch/.test(value)) return "Hatch";
  if (/sedan|sedã/.test(value)) return "Sedan";
  if (/picape|pickup|caminhonete/.test(value)) return "Picape";
  return "Outros";
}

function ReviewStars({ rating }: { rating: number }) {
  return <span className="text-amber-500" aria-label={rating + " de 5 estrelas"}>{"★".repeat(rating)}{"☆".repeat(5 - rating)}</span>;
}

function Reviews({ dealer, reviews }: { dealer: PublicDealer; reviews: DealerReview[] }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length < 15) return;
    setSending(true);
    setMessage("");
    try {
      const response = await fetch("/api/public/dealers/" + encodeURIComponent(dealer.slug) + "/reviews", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim() }),
      });
      if (response.status === 401) {
        setMessage("Entre na sua conta para avaliar a loja.");
      } else {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(json.error || "Não foi possível enviar sua avaliação.");
        setMessage("Avaliação enviada! Ela aparecerá publicamente após a atualização da página.");
        setBody("");
        setOpen(false);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Erro ao avaliar.");
    } finally {
      setSending(false);
    }
  }
  return (
    <section id="avaliacoes" aria-labelledby="avaliacoes-titulo" className="min-w-0 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="avaliacoes-titulo" className="text-lg font-extrabold text-cnc-text-strong">Avaliações dos clientes {reviews.length ? "(" + reviews.length + ")" : ""}</h2>
        <button type="button" onClick={() => setOpen(!open)} className="text-sm font-bold text-primary hover:underline">
          {open ? "Cancelar" : "Avaliar esta loja"}
        </button>
      </div>
      {open ? (
        <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl border border-cnc-line bg-white p-4">
          <p className="text-sm text-cnc-muted">A avaliação será pública e vinculada à sua conta. Uma avaliação por pessoa.</p>
          <label className="block text-sm font-semibold text-cnc-text-strong">
            Nota
            <select aria-label="Nota da loja" className="mt-1 block h-11 w-full rounded-lg border border-cnc-line bg-white px-3" value={rating} onChange={e => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} estrelas</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-cnc-text-strong">
            Sua experiência
            <textarea className="mt-1 min-h-28 w-full rounded-lg border border-cnc-line p-3 text-base" value={body} onChange={e=>setBody(e.target.value)} maxLength={500} placeholder="Conte como foi seu atendimento (15 a 500 caracteres)." />
          </label>
          <button disabled={sending || body.trim().length < 15} className="h-11 w-full rounded-lg bg-primary text-sm font-bold text-white disabled:opacity-50">{sending ? "Enviando..." : "Publicar avaliação"}</button>
        </form>
      ) : null}
      {message ? <p role="status" className="mt-2 text-sm text-cnc-text-strong">{message} {message.includes("Entre na sua conta") ? <Link href={"/login?next=" + encodeURIComponent("/lojas/" + dealer.slug)} className="font-bold text-primary underline">Fazer login</Link> : null}</p> : null}
      {reviews.length ? (
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {reviews.map(review => (
            <li key={review.id} className="rounded-xl border border-cnc-line bg-cnc-surface p-4 shadow-card">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-cnc-text-strong">{review.author}</p>
                  <ReviewStars rating={review.rating} />
                </div>
                <time className="text-xs text-cnc-muted" dateTime={review.createdAt}>{review.createdAt.slice(0, 10).split("-").reverse().join("/")}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-cnc-muted">{review.body}</p>
            </li>
          ))}
        </ul>
      ) : <div className="mt-3 rounded-xl border border-cnc-line bg-cnc-surface p-5 text-sm text-cnc-muted">Esta loja ainda não recebeu avaliações públicas.</div>}
    </section>
  );
}

export default function DealerStorefront({ dealer, ads, reviews }: Props) {
  const [category, setCategory] = useState("Todos");
  const [expanded, setExpanded] = useState(false);
  const validAds = useMemo(() => ads.filter(ad => buildPublicVehicleHref(ad) !== null), [ads]);
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ad of validAds) {
      const key = categoryOf(ad);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [validAds]);
  const filters = Object.keys(categoryCounts).filter(key => key !== "Outros");
  const filtered = category === "Todos" ? validAds : validAds.filter(ad => categoryOf(ad) === category);
  const visible = expanded ? filtered : filtered.slice(0, 6);
  const territory = buildPublicTerritoryLabel({ city: dealer.city, state: dealer.state });
  const initials = dealer.name.split(/\s+/).slice(0, 2).map(part => part[0] || "").join("").toUpperCase();
  const digits = (dealer.whatsapp || "").replace(/\D/g, "");
  const whatsapp = digits.length === 10 || digits.length === 11 ? "55" + digits : digits.startsWith("55") && (digits.length === 12 || digits.length === 13) ? digits : null;

  return (
    <main className="mx-auto w-full max-w-7xl overflow-x-hidden pb-28 sm:px-6 sm:pb-20 lg:px-8">
      <nav aria-label="Trilha" className="mx-3 flex gap-2 py-3 text-xs text-cnc-muted sm:mx-0 sm:text-sm">
        <Link href="/">Início</Link><span aria-hidden="true">/</span><Link href="/comprar">Comprar</Link><span aria-hidden="true">/</span><span className="truncate font-semibold">{dealer.name}</span>
      </nav>

      <section aria-label="Identidade da loja" className="overflow-hidden rounded-none bg-cnc-surface shadow-card sm:rounded-2xl sm:border sm:border-cnc-line">
        <div className="relative aspect-[16/8] w-full overflow-hidden bg-gradient-to-br from-[#0b214c] via-[#173b6b] to-[#1f66e5] sm:aspect-[16/5]">
          {dealer.coverUrl ? (
            <Image src={dealer.coverUrl} alt={"Fachada da " + dealer.name} fill unoptimized priority sizes="(max-width: 640px) 100vw, 1200px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-xl font-bold text-white/90 sm:text-3xl">Bem-vindo à {dealer.name}</div>
          )}
        </div>
        <div className="relative px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="relative -mt-9 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-white bg-primary-soft text-xl font-extrabold text-primary shadow-card sm:-mt-12 sm:h-28 sm:w-28">
              {dealer.logoUrl ? <Image src={dealer.logoUrl} alt={"Logotipo de " + dealer.name} fill unoptimized sizes="112px" className="object-contain" /> : initials}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-cnc-text-strong sm:text-3xl">{dealer.name}</h1>
              <p className="mt-1 text-xs text-cnc-muted sm:text-sm">{territory}</p>
              <p className="mt-1 text-xs font-bold text-cnc-text-strong sm:text-sm">{dealer.totalActiveAds} {dealer.totalActiveAds === 1 ? "anúncio ativo" : "anúncios ativos"}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:flex">
            <a href="#estoque" className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-primary px-5 text-sm font-extrabold text-white transition hover:bg-primary-strong">Ver estoque da loja <span className="ml-2" aria-hidden="true">→</span></a>
            {whatsapp ? <a className="flex min-h-12 flex-1 items-center justify-center rounded-xl bg-[#10894b] px-5 text-sm font-extrabold text-white transition hover:bg-[#0c713d]" href={"https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("Olá! Encontrei a " + dealer.name + " no Carros na Cidade e gostaria de mais informações.")} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a> : null}
          </div>
        </div>
      </section>

      <nav aria-label="Seções da loja" className="sticky top-0 z-10 mt-3 flex justify-around border-y border-cnc-line bg-white/95 py-3 text-sm font-bold text-cnc-text-strong backdrop-blur-sm sm:top-16 sm:rounded-xl">
        <a href="#estoque" className="hover:text-primary">Veículos</a>
        <a href="#sobre" className="hover:text-primary">Sobre</a>
        <a href="#avaliacoes" className="hover:text-primary">Avaliações {reviews.length ? "(" + reviews.length + ")" : ""}</a>
      </nav>

      <section id="estoque" aria-labelledby="estoque-titulo" className="scroll-mt-24 px-3 pt-6 sm:px-0 sm:pt-8">
        <h2 id="estoque-titulo" className="text-lg font-extrabold text-cnc-text-strong sm:text-2xl">Veículos da loja</h2>
        {validAds.length ? (
          <>
            {filters.length ? (
              <div aria-label="Filtrar por carroceria" className="mt-3 flex gap-2 overflow-x-auto pb-2">
                {["Todos", ...filters].map(item => (
                  <button key={item} type="button" onClick={() => { setCategory(item); setExpanded(false); }}
                    aria-pressed={category === item}
                    className={"shrink-0 rounded-full border px-3 py-2 text-xs font-bold sm:text-sm " + (category === item ? "border-primary bg-primary-soft text-primary" : "border-cnc-line bg-white text-cnc-muted")}>
                    {item} ({item === "Todos" ? validAds.length : categoryCounts[item]})
                  </button>
                ))}
              </div>
            ) : null}
            <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
              {visible.map(ad => <li key={ad.id} className="min-w-0"><AdCard ad={ad} variant="carousel" showDealerPill={false} /></li>)}
            </ul>
            {!expanded && filtered.length > 6 ? (
              <button type="button" className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl border border-primary bg-white px-5 text-sm font-bold text-primary hover:bg-primary-soft" onClick={() => setExpanded(true)}>Ver todos os {filtered.length} veículos <span className="ml-2" aria-hidden="true">→</span></button>
            ) : null}
          </>
        ) : (
          <div className="mt-3 rounded-xl border border-cnc-line bg-white p-6 text-center text-sm text-cnc-muted">A loja não possui anúncios ativos no momento.</div>
        )}
      </section>

      <div className="mt-8 grid gap-6 px-3 sm:px-0 lg:grid-cols-2">
        <section id="sobre" aria-labelledby="sobre-titulo" className="scroll-mt-24">
          <h2 id="sobre-titulo" className="text-lg font-extrabold text-cnc-text-strong">Sobre a loja</h2>
          <div className="mt-3 rounded-xl border border-cnc-line bg-cnc-surface p-5 shadow-card">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-cnc-muted">{dealer.description || "Esta loja anuncia seus veículos no Carros na Cidade. Consulte o estoque e negocie diretamente com o anunciante."}</p>
            <p className="mt-3 text-sm font-semibold text-cnc-text-strong">{territory}</p>
          </div>
        </section>
        <Reviews dealer={dealer} reviews={reviews} />
      </div>
      <p className="px-3 pt-8 text-xs text-cnc-muted sm:px-0">O Carros na Cidade divulga anúncios, mas não intermedeia negociações nem garante veículos, preços ou atendimentos.</p>
    </main>
  );
}
