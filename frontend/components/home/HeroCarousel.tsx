"use client"

import useEmblaCarousel from "embla-carousel-react"
import Image from "next/image"
import { useEffect } from "react"

const banners = [
  "/images/banner1.jpg",
  "/images/banner2.jpg",
]

export default function HeroCarousel() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true })

  useEffect(() => {
    if (!emblaApi) return
    const interval = setInterval(() => {
      emblaApi.scrollNext()
    }, 5000)
    return () => clearInterval(interval)
  }, [emblaApi])

  return (
    <div className="overflow-hidden rounded-2xl relative" ref={emblaRef}>
      <div className="flex">
        {banners.map((src, index) => (
          <div className="min-w-full relative h-[420px]" key={index}>
            <Image
              src={src}
              alt={`Banner ${index + 1}`}
              fill
              priority={index === 0}
              className="object-cover"
            />

            <div className="absolute inset-0 bg-black/40 flex flex-col justify-center pl-16 text-white">
              <h1 className="text-4xl font-bold max-w-xl">
                Encontre seu próximo carro em São Paulo
              </h1>
              <p className="mt-4 text-lg">
                Milhares de ofertas esperando por você
              </p>
              <button className="mt-6 bg-blue-600 px-6 py-3 rounded-lg w-fit hover:bg-blue-700 transition">
                Pesquisar agora
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}