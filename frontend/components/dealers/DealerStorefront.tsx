"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { AdCard } from "@/components/ads/AdCard";
import type { PublicDealer, DealerReview } from "@/lib/dealers/fetch-public-dealer";
import type { AdItem } from "@/lib/search/ads-search";
import { buildPublicTerritoryLabel, buildPublicVehicleHref } from "@/lib/public-contracts";

type Props = { dealer: PublicDealer; ads: AdItem[]; reviews: DealerReview[] };
type FilterKey = "Todos" | "SUV" | "Hatch" | "Sedan" | "Picape" | "Outros" | "Automático" | "Flex" | "Diesel";
type SortKey = "recentes" | "menor-preco" | "maior-preco";

const CARD = "rounded-2xl border border-[#e5ebf4] bg-white shadow-[0_8px_26px_rgba(18,34,63,0.06)]";
const ICON_CLASS = "h-[19px] w-[19px] shrink-0";

function Icon({ name, className = ICON_CLASS }: { name: "pin" | "car" | "phone" | "clock" | "arrow" | "chat" | "check"; className?: string }) {
  const paths: Record<typeof name, React.ReactNode> = {
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    car: <><path d="m5 11 1.7-5h10.6L19 11M5 11H4a2 2 0 0 0-2 2v5h20v-5a2 2 0 0 0-2-2h-1M5 11h14M5 18v2M19 18v2" /><circle cx="7" cy="15" r="1" /><circle cx="17" cy="15" r="1" /></>,
    phone: <path d="M21 16.4v3a2 2 0 0 1-2.2 2A18.5 18.5 0 0 1 2.6 5.2 2 2 0 0 1 4.6 3h3A2 2 0 0 1 9.5 4.7l.6 2.8a2 2 0 0 1-.6 1.9L8 10.7a14.5 14.5 0 0 0 5.3 5.3l1.3-1.5a2 2 0 0 1 1.9-.6l2.8.6A2 2 0 0 1 21 16.4Z" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    arrow: <><path d="M4 12h16M14 6l6 6-6 6" /></>,
    chat: <><path d="M20 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.7-4.7A8.5 8.5 0 1 1 20 11.5Z" /><path d="M8.5 9.5c.5 2.1 2 3.6 4.2 4.3l1.1-1.1 2.2 1.1" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function categoryOf(ad: AdItem): FilterKey {
  const text = String(ad.body_type ?? "").toLowerCase();
  if (/suv|crossover|utilit/.test(text)) return "SUV";
  if (/hatch/.test(text)) return "Hatch";
  if (/sedan|sedã/.test(text)) return "Sedan";
  if (/picape|pickup|caminhonete/.test(text)) return "Picape";
  return "Outros";
}

function matchesFilter(ad: AdItem, filter: FilterKey): boolean {
  if (filter === "Todos") return true;
  if (filter === "Automático") return /autom|cvt|dct|dupla embreagem/i.test(String(ad.transmission ?? ""));
  if (filter === "Flex") return /flex/i.test(String(ad.fuel_type ?? ""));
  if (filter === "Diesel") return /diesel/i.test(String(ad.fuel_type ?? ""));
  return categoryOf(ad) === filter;
}

function brPhone(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (digits.length === 11) return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 7) + "-" + digits.slice(7);
  if (digits.length === 10) return "(" + digits.slice(0, 2) + ") " + digits.slice(2, 6) + "-" + digits.slice(6);
  return value;
}

function waDigits(value: string | null): string | null {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  return null;
}

function Reviews({ dealer, reviews }: { dealer: PublicDealer; reviews: DealerReview[] }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (body.trim().length < 15 || sending) return;
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
        setMessage("Avaliação enviada. Ela aparecerá publicamente após a atualização da página.");
        setBody("");
        setOpen(false);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Não foi possível enviar sua avaliação.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="avaliacoes" aria-labelledby="avaliacoes-titulo" className={CARD + " scroll-mt-32 p-4 sm:p-6"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="avaliacoes-titulo" className="text-lg font-extrabold text-[#142447]">Avaliações dos clientes</h2>
          {average !== null ? (
            <div className="mt-1 flex items-center gap-2 text-sm">
              <span className="text-lg font-extrabold text-[#152548]">★ {average.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</span>
              <span className="text-[#65748a]">{reviews.length} {reviews.length === 1 ? "avaliação pública" : "avaliações públicas"}</span>
            </div>
          ) : <p className="mt-1 text-xs text-[#65748a]">Ainda sem avaliações publicadas.</p>}
        </div>
        <button onClick={() => setOpen(!open)} type="button" className="rounded-lg border border-[#c7d8f5] px-3 py-2 text-xs font-bold text-[#1258d9] hover:bg-[#f2f7ff]">
          {open ? "Cancelar" : "Avaliar esta loja"}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="mt-4 space-y-3 rounded-xl bg-[#f5f8ff] p-4">
          <p className="text-sm text-[#526078]">Sua avaliação será pública e vinculada à sua conta. É permitida uma avaliação por pessoa.</p>
          <label className="block text-sm font-semibold text-[#142447]">
            Nota
            <select aria-label="Nota da loja" className="mt-1 block h-11 w-full rounded-lg border border-[#d9e2f1] bg-white px-3" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
              {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} {n === 1 ? "estrela" : "estrelas"}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-[#142447]">
            Sua experiência
            <textarea className="mt-1 min-h-28 w-full rounded-lg border border-[#d9e2f1] bg-white p-3 text-base" value={body} onChange={(e) => setBody(e.target.value)} maxLength={500} placeholder="Conte sobre seu atendimento (mínimo de 15 caracteres)." />
          </label>
          <button disabled={sending || body.trim().length < 15} className="h-11 w-full rounded-lg bg-[#1457d9] font-bold text-white disabled:opacity-50">
            {sending ? "Enviando..." : "Publicar avaliação"}
          </button>
        </form>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-[#344259]">
          {message}{" "}
          {message.includes("Entre na sua conta") && (
            <Link href={"/login?next=" + encodeURIComponent("/lojas/" + dealer.slug)} className="font-bold text-[#1457d9] underline">Fazer login</Link>
          )}
        </p>
      )}

      {reviews.length ? (
        <ul className="mt-4 space-y-3">
          {reviews.map((review) => (
            <li key={review.id} className="rounded-xl border border-[#e8edf5] p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#e7efff] text-sm font-extrabold text-[#2052a1]" aria-hidden="true">
                  {review.author.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#152548]">{review.author}</p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="tracking-wide text-amber-500" aria-label={review.rating + " de 5 estrelas"}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span>
                    <time className="text-[#748098]" dateTime={review.createdAt}>{review.createdAt.slice(0, 10).split("-").reverse().join("/")}</time>
                  </div>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#4b5870]">{review.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-[#cfdaeb] bg-[#f8faff] p-5 text-sm text-[#607087]">
          Esta loja ainda não recebeu avaliações públicas. Os comentários aparecerão aqui quando forem publicados por clientes.
        </div>
      )}
    </section>
  );
}

export default function DealerStorefront({ dealer, ads, reviews }: Props) {
  const [filter, setFilter] = useState<FilterKey>("Todos");
  const [sort, setSort] = useState<SortKey>("recentes");
  const [expanded, setExpanded] = useState(false);
  const validAds = useMemo(() => ads.filter((ad) => buildPublicVehicleHref(ad) !== null), [ads]);
  const filters = useMemo(() => {
    const choices: FilterKey[] = ["Todos", "SUV", "Hatch", "Sedan", "Picape", "Outros", "Automático", "Flex", "Diesel"];
    return choices.map((key) => ({ key, count: validAds.filter((ad) => matchesFilter(ad, key)).length }))
      .filter((choice) => choice.key === "Todos" || choice.count > 0);
  }, [validAds]);
  const filtered = useMemo(() => {
    const items = validAds.filter((ad) => matchesFilter(ad, filter));
    if (sort === "menor-preco") items.sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));
    if (sort === "maior-preco") items.sort((a, b) => Number(b.price ?? 0) - Number(a.price ?? 0));
    return items;
  }, [validAds, filter, sort]);
  const visible = expanded ? filtered : filtered.slice(0, 8);
  const territory = buildPublicTerritoryLabel({ city: dealer.city, state: dealer.state });
  const initials = dealer.name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
  const whatsapp = waDigits(dealer.whatsapp);
  const phoneDigits = dealer.phone?.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "") || null;
  const whatsappLink = whatsapp ? "https://wa.me/" + whatsapp + "?text=" + encodeURIComponent("Olá! Encontrei a " + dealer.name + " no Carros na Cidade e gostaria de mais informações.") : null;
  const hasContactInfo = Boolean(dealer.address || dealer.phone || dealer.whatsapp || dealer.businessHours);
  const contactRow = "flex items-start gap-3 text-sm leading-relaxed text-[#34435d]";

  return (
    <main className="mx-auto w-full max-w-[1320px] overflow-x-hidden px-3 pb-24 sm:px-5 sm:pb-20 lg:px-8">
      <nav aria-label="Trilha de navegação" className="flex items-center gap-2 overflow-hidden py-3 text-xs text-[#68778e] sm:py-4 sm:text-sm">
        <Link className="hover:text-[#135bd8]" href="/">Início</Link><span aria-hidden="true">/</span>
        <Link className="hover:text-[#135bd8]" href="/comprar">Comprar</Link><span aria-hidden="true">/</span>
        <span className="truncate font-semibold text-[#142447]">{dealer.name}</span>
      </nav>

      <div className="relative">
        <div className="relative aspect-[16/8] w-full overflow-hidden rounded-2xl bg-gradient-to-r from-[#10254b] to-[#1d60c9] sm:aspect-[16/5] lg:aspect-[5/1]">
          {dealer.coverUrl ? (
            <Image src={dealer.coverUrl} alt={"Fachada da loja " + dealer.name} fill unoptimized priority sizes="(max-width: 768px) 100vw, 1320px" className="object-cover object-center" />
          ) : (
            <div className="flex h-full items-center justify-center px-5 text-center text-xl font-extrabold text-white/95 sm:text-3xl">{dealer.name}</div>
          )}
        </div>

        <div className="relative z-[1] -mt-6 grid gap-3 px-1 sm:-mt-12 sm:gap-4 sm:px-3 lg:grid-cols-[minmax(0,1.95fr)_minmax(290px,1fr)]">
          <section aria-label="Identidade da loja" className={CARD + " min-w-0 p-4 sm:p-6"}>
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#dde5f3] bg-[#121821] text-base font-extrabold text-white shadow-sm sm:h-32 sm:w-32">
                {dealer.logoUrl ? <Image src={dealer.logoUrl} alt={"Logotipo da " + dealer.name} fill unoptimized sizes="(max-width: 640px) 80px, 128px" className="object-contain" /> : initials}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <h1 className="break-words text-xl font-extrabold tracking-tight text-[#122344] sm:text-3xl">{dealer.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#65738b] sm:text-sm">
                  {territory && <span className="inline-flex items-center gap-1.5"><Icon name="pin" className="h-4 w-4 text-[#155ed6]" />{territory}</span>}
                  <span className="inline-flex items-center gap-1.5 font-semibold text-[#263856]"><Icon name="car" className="h-4 w-4 text-[#155ed6]" />{dealer.totalActiveAds} {dealer.totalActiveAds === 1 ? "anúncio ativo" : "anúncios ativos"}</span>
                </div>
                <p className="mt-3 hidden text-sm leading-relaxed text-[#526079] sm:block">
                  Consulte os veículos anunciados pela {dealer.name} e negocie diretamente com a loja, sem intermediação do portal.
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-semibold text-[#395477] sm:mt-5">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4eaf4] bg-[#f7f9ff] px-3 py-2"><Icon name="check" className="h-4 w-4 text-[#145de0]" />Contato direto</span>
              {dealer.address && <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4eaf4] bg-[#f7f9ff] px-3 py-2"><Icon name="pin" className="h-4 w-4 text-[#145de0]" />Endereço comercial informado</span>}
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <a href="#estoque" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#1262e8] px-3 py-3 text-center text-sm font-extrabold text-white shadow-sm transition hover:bg-[#064cbe]">
                <Icon name="car" />Ver estoque da loja<Icon name="arrow" className="h-4 w-4" />
              </a>
              {whatsappLink && <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#089853] px-3 py-3 text-center text-sm font-extrabold text-white shadow-sm transition hover:bg-[#087a45]">
                <Icon name="chat" />Chamar no WhatsApp
              </a>}
            </div>
          </section>

          <aside aria-label="Informações de contato" className={CARD + " min-w-0 p-4 sm:p-6"}>
            <h2 className="text-base font-extrabold text-[#152548] sm:text-lg">Informações de contato</h2>
            {hasContactInfo ? (
              <div className="mt-4 space-y-4">
                {dealer.address && <div className={contactRow}>
                  <Icon name="pin" className="mt-0.5 h-5 w-5 text-[#1764e6]" />
                  <div className="min-w-0"><p className="whitespace-pre-wrap break-words font-semibold">{dealer.address}</p>
                    {territory && !dealer.address.toLowerCase().includes((dealer.city || "").toLowerCase()) && <p className="mt-0.5 text-xs text-[#738199]">{territory}</p>}
                  </div>
                </div>}
                {dealer.phone && <div className={contactRow}>
                  <Icon name="phone" className="mt-0.5 h-5 w-5 text-[#1764e6]" />
                  {phoneDigits && (phoneDigits.length === 10 || phoneDigits.length === 11) ? (
                    <a className="font-semibold hover:text-[#145dd9] hover:underline" href={"tel:+55" + phoneDigits}>{brPhone(dealer.phone)}</a>
                  ) : <span className="font-semibold">{dealer.phone}</span>}
                </div>}
                {dealer.whatsapp && <div className={contactRow}>
                  <Icon name="chat" className="mt-0.5 h-5 w-5 text-[#079950]" />
                  {whatsappLink ? <a className="font-semibold hover:text-[#079950] hover:underline" target="_blank" rel="noopener noreferrer" href={whatsappLink}>{brPhone(dealer.whatsapp)}</a> : <span className="font-semibold">{dealer.whatsapp}</span>}
                </div>}
                {dealer.businessHours && <div className={contactRow}>
                  <Icon name="clock" className="mt-0.5 h-5 w-5 text-[#1764e6]" />
                  <p className="whitespace-pre-line break-words font-medium">{dealer.businessHours}</p>
                </div>}
              </div>
            ) : <p className="mt-4 text-sm text-[#66748a]">A loja ainda não informou seus dados de contato.</p>}
          </aside>
        </div>
      </div>

      <nav aria-label="Seções da loja" className="sticky top-0 z-20 mt-4 grid grid-cols-3 rounded-xl border border-[#e5ebf4] bg-white/95 text-center text-xs font-bold text-[#465776] shadow-sm backdrop-blur-sm sm:top-16 sm:text-sm">
        <a href="#estoque" className="rounded-l-xl border-b-[3px] border-[#1769ed] px-2 py-4 text-[#125bd8] transition hover:bg-[#f4f8ff]">Veículos ({validAds.length})</a>
        <a href="#sobre" className="px-2 py-4 transition hover:bg-[#f4f8ff] hover:text-[#125bd8]">Sobre a loja</a>
        <a href="#avaliacoes" className="rounded-r-xl px-2 py-4 transition hover:bg-[#f4f8ff] hover:text-[#125bd8]">Avaliações{reviews.length ? " (" + reviews.length + ")" : ""}</a>
      </nav>

      <section id="estoque" aria-labelledby="estoque-titulo" className="scroll-mt-32 pt-7 sm:pt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="estoque-titulo" className="text-xl font-extrabold tracking-tight text-[#142447] sm:text-2xl">Veículos da loja</h2>
          <span className="text-xs font-semibold text-[#155cce] sm:text-sm">{validAds.length} {validAds.length === 1 ? "oferta disponível" : "ofertas disponíveis"}</span>
        </div>

        {validAds.length ? (
          <>
            <div className="mt-4 flex items-center gap-3">
              <div aria-label="Filtrar o estoque" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-2">
                {filters.map(({ key, count }) => (
                  <button key={key} type="button" aria-pressed={filter === key} onClick={() => { setFilter(key); setExpanded(false); }}
                    className={"shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition sm:text-sm " + (filter === key ? "border-[#145de4] bg-[#eff5ff] text-[#145de4]" : "border-[#dbe3ef] bg-white text-[#637189] hover:border-[#b7c9eb]")}>
                    {key} ({count})
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3 flex justify-end">
              <label className="inline-flex items-center gap-2 text-xs text-[#637189]">
                Ordenar por
                <select className="min-h-10 rounded-lg border border-[#dbe3ef] bg-white px-2.5 text-xs font-semibold text-[#273858] sm:text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="recentes">Mais recentes</option>
                  <option value="menor-preco">Menor preço</option>
                  <option value="maior-preco">Maior preço</option>
                </select>
              </label>
            </div>
            <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-4">
              {visible.map((ad) => <li key={ad.id} className="min-w-0"><AdCard ad={ad} variant="carousel" showDealerPill={false} /></li>)}
            </ul>
            {!expanded && filtered.length > visible.length && (
              <button type="button" onClick={() => setExpanded(true)} className="mx-auto mt-6 flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[#c3d6f5] bg-white px-8 text-sm font-extrabold text-[#125bd8] transition hover:bg-[#eef5ff]">
                Ver todos os {filtered.length} veículos <Icon name="arrow" className="h-4 w-4" />
              </button>
            )}
          </>
        ) : <div className={CARD + " mt-4 p-6 text-center text-sm text-[#60718b]"}>Esta loja não possui anúncios ativos no momento.</div>}
      </section>

      <div className="mt-8 grid items-start gap-4 lg:grid-cols-2">
        <section id="sobre" aria-labelledby="sobre-titulo" className={CARD + " scroll-mt-32 p-4 sm:p-6"}>
          <h2 id="sobre-titulo" className="text-lg font-extrabold text-[#142447]">Sobre a loja</h2>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-[#536179]">
            {dealer.description?.replace(/\*\*/g, "") || "Esta loja divulga seus veículos no Carros na Cidade. Consulte o estoque e negocie diretamente com o anunciante."}
          </p>
          <div className="mt-5 border-t border-[#e9edf5] pt-3 text-xs text-[#6a788f]">
            Os anúncios são publicados pelo lojista. O Carros na Cidade não participa da negociação.
          </div>
        </section>
        <Reviews dealer={dealer} reviews={reviews} />
      </div>

      <p className="mt-8 px-1 text-xs leading-relaxed text-[#758299]">
        O Carros na Cidade divulga anúncios e não intermedeia negociações, recebe pagamentos de veículos ou garante a condição das ofertas.
      </p>
    </main>
  );
}
