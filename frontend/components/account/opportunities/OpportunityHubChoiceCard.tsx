import Image from "next/image";
import Link from "next/link";

/**
 * Painéis de decisão do hub. A imagem do veículo é um elemento decorativo
 * (não é uma oportunidade ou anúncio); todas as ações e textos são HTML.
 * No celular a foto sai para não concorrer com a informação ou com o CTA.
 */
export type ChoiceTone = "blue" | "teal";

const TONE = {
  blue: {
    shell:
      "border-[#D8E7FC] bg-[radial-gradient(ellipse_at_95%_4%,#BDD9FF_0%,transparent_48%),linear-gradient(115deg,#F4F8FF_0%,#FFFFFF_60%,#E7F1FF_100%)]",
    pill: "bg-[#DCEBFF] text-[#0759CA]",
    check: "bg-[#1465DD]",
    button:
      "bg-[linear-gradient(115deg,#1251C3,#1581E9)] shadow-[0_9px_18px_-9px_rgba(20,100,221,0.55)]",
    photo: "/images/oportunidades/modelos/volkswagen-virtus.webp",
    photoAlt: "Ilustração decorativa de veículo",
  },
  teal: {
    shell:
      "border-[#D0EDE4] bg-[radial-gradient(ellipse_at_93%_5%,#BFF0DE_0%,transparent_50%),linear-gradient(115deg,#F1FBF8_0%,#FFFFFF_60%,#E2F8F0_100%)]",
    pill: "bg-[#D6F6E8] text-[#057956]",
    check: "bg-[#07946B]",
    button:
      "bg-[linear-gradient(115deg,#047B5C,#079E76)] shadow-[0_9px_18px_-9px_rgba(7,148,107,0.46)]",
    photo: "/images/oportunidades/modelos/fiat-pulse.webp",
    photoAlt: "Ilustração decorativa de veículo",
  },
} as const;

export default function OpportunityHubChoiceCard({
  tone,
  art,
  title,
  description,
  benefits,
  ctaLabel,
  ctaHref,
  howItWorksHref,
  testId,
  ctaTestId,
}: {
  tone: ChoiceTone;
  art: React.ReactNode;
  title: string;
  description: string;
  benefits: readonly string[];
  ctaLabel: string;
  ctaHref: string;
  howItWorksHref: string;
  testId: string;
  ctaTestId: string;
}) {
  const style = TONE[tone];
  const label = tone === "blue" ? "VENDER MAIS" : "COMPRAR MELHOR";

  return (
    <article
      className={`relative isolate flex min-h-[360px] flex-col overflow-hidden rounded-[22px] border px-5 py-6 shadow-[0_8px_24px_-16px_rgba(20,46,90,0.18)] sm:px-7 lg:min-h-[365px] ${style.shell}`}
      data-testid={testId}
    >
      {/* Ilustrações são decorativas, não correspondem a um anúncio real. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <span className="absolute -right-9 -top-14 h-60 w-60 rounded-full border-[28px] border-white/30 blur-[1px]" />
        <div className="absolute right-[-7%] top-[9%] w-[35%] max-w-[190px] opacity-55 sm:right-[3%] sm:top-[8%] lg:right-[-2%]">
          {art}
        </div>
        <div className="absolute bottom-0 right-[-12%] hidden h-[70%] w-[62%] [mask-image:linear-gradient(to_right,transparent_0%,black_30%)] sm:block lg:right-[-18%] lg:w-[69%] xl:right-[-12%]">
          <Image
            src={style.photo}
            alt=""
            fill
            sizes="(max-width: 1024px) 280px, 370px"
            className="object-contain object-right-bottom drop-shadow-[0_9px_10px_rgba(19,45,81,0.14)]"
          />
        </div>
      </div>

      <div className="relative z-10 flex flex-1 flex-col">
        <div className="max-w-full">
          <span className={`inline-flex rounded-lg px-3 py-1 text-[11px] font-extrabold tracking-[0.04em] ${style.pill}`}>
            {label}
          </span>
          <h2 className="mt-3 max-w-[430px] text-[22px] font-extrabold leading-[1.12] tracking-[-0.035em] text-[#101B3D] sm:text-[25px] lg:text-[23px] xl:text-[27px]">
            {title}
          </h2>
          <p className="mt-2 max-w-[390px] text-[13.5px] leading-relaxed text-[#566786] lg:max-w-[68%] xl:max-w-[69%]">
            {description}
          </p>

          <ul className="mt-4 max-w-[410px] space-y-2.5 lg:max-w-[75%] xl:max-w-[72%]">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5">
                <span className={`mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-white ${style.check}`} aria-hidden="true">
                  <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="m3.5 8 3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-[12.5px] leading-snug text-[#415374] sm:text-[13px]">
                  {benefit}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-5">
          <Link
            href={ctaHref}
            className={`inline-flex min-h-[49px] w-full items-center justify-center gap-3 rounded-xl px-4 text-center text-[13px] font-bold text-white transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0e62d8] focus-visible:ring-offset-2 sm:w-auto sm:min-w-[230px] lg:min-w-[0px] lg:max-w-[72%] xl:min-w-[255px] ${style.button}`}
            data-testid={ctaTestId}
          >
            {ctaLabel}
            <span aria-hidden="true">→</span>
          </Link>
          <a
            href={howItWorksHref}
            className="text-[12px] font-semibold text-[#566786] underline-offset-4 hover:underline focus-visible:underline"
          >
            Como funciona
          </a>
        </div>
      </div>
    </article>
  );
}
