export function HomeCarouselsSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1].map((section) => (
        <section
          key={`skeleton-section-${section}`}
          className="mx-auto w-full max-w-[1240px] px-4 pt-6 sm:px-6 sm:pt-10 lg:px-8 lg:pt-12"
        >
          <div className="mb-4 flex items-start gap-2.5 sm:mb-6 sm:gap-3">
            <span className="h-9 w-9 shrink-0 rounded-[10px] bg-[#eef1f9] sm:h-11 sm:w-11 sm:rounded-[12px]" />
            <div className="min-w-0 space-y-1.5">
              <div className="h-4 w-44 rounded bg-[#eef1f9] sm:h-5 sm:w-56" />
              <div className="h-3 w-64 rounded bg-[#f2f4fa] sm:w-72" />
            </div>
          </div>
          <div className="flex gap-3 overflow-hidden pb-2 sm:gap-4">
            {[0, 1, 2, 3].map((card) => (
              <div
                key={`skeleton-card-${section}-${card}`}
                className="w-[230px] shrink-0 overflow-hidden rounded-[12px] border border-[#e7e8f1] bg-white sm:w-[270px] sm:rounded-[14px] md:w-[calc((100%-3rem)/4)]"
              >
                <div className="aspect-[16/11] w-full bg-[#eef0f6]" />
                <div className="space-y-2 px-3 pb-3 pt-2.5 sm:px-4 sm:pb-4 sm:pt-3">
                  <div className="h-3.5 w-3/4 rounded bg-[#eef1f9]" />
                  <div className="h-3 w-1/2 rounded bg-[#f2f4fa]" />
                  <div className="h-3 w-2/3 rounded bg-[#f2f4fa]" />
                  <div className="mt-3 flex items-end justify-between">
                    <div className="h-4 w-20 rounded bg-[#e5eaf5]" />
                    <div className="h-3 w-12 rounded bg-[#f2f4fa]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
