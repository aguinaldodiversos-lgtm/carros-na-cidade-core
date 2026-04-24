"use client";

import Image from "next/image";
import { useCallback, useState } from "react";

import { LISTING_CARD_FALLBACK_IMAGE } from "@/lib/vehicle/detail-utils";
import { shouldSkipNextImageOptimizer } from "@/lib/images/image-optimization";

type Props = {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
};

export default function CatalogVehicleCardImage({
  src,
  alt,
  priority = false,
  sizes,
}: Props) {
  const [broken, setBroken] = useState(false);
  const onError = useCallback(() => setBroken(true), []);
  const resolved = broken ? LISTING_CARD_FALLBACK_IMAGE : src;
  const unoptimized = shouldSkipNextImageOptimizer(resolved);

  return (
    <Image
      src={resolved}
      alt={alt}
      fill
      unoptimized={unoptimized}
      onError={onError}
      className="object-cover transition duration-500 group-hover:scale-[1.04]"
      sizes={sizes}
      priority={priority}
      loading={priority ? undefined : "lazy"}
    />
  );
}
