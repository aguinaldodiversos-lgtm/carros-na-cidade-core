"use client";

import Image from "next/image";
import { useRef, useState } from "react";

const PLACEHOLDER = "/images/vehicle-placeholder.svg";

interface VehicleCardImageProps {
  src: string;
  alt: string;
  featured?: boolean;
  className?: string;
  sizes?: string;
}

export function VehicleCardImage({ src, alt, featured, className, sizes }: VehicleCardImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  const [failed, setFailed] = useState(false);
  const fallbackInProgress = useRef(false);

  const useUnoptimized =
    imgSrc.startsWith("/api/vehicle-images") ||
    imgSrc.startsWith("http") ||
    imgSrc.startsWith("data:") ||
    imgSrc.endsWith(".svg");

  return (
    <>
      {!failed ? (
        <Image
          src={imgSrc}
          alt={alt}
          fill
          unoptimized={useUnoptimized}
          className={className}
          sizes={
            sizes ?? (featured ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1280px) 33vw, 50vw")
          }
          loading="lazy"
          onError={() => {
            if (fallbackInProgress.current) return;
            fallbackInProgress.current = true;
            if (imgSrc !== PLACEHOLDER) {
              setImgSrc(PLACEHOLDER);
              fallbackInProgress.current = false;
            } else {
              setFailed(true);
            }
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={PLACEHOLDER}
            alt=""
            aria-hidden="true"
            className="h-16 w-16 opacity-40"
          />
        </div>
      )}
    </>
  );
}
