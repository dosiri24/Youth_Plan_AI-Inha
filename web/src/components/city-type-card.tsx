"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import {
  TYPE_IMAGE_HEIGHT,
  TYPE_IMAGE_WIDTH,
  type CityType,
} from "@/lib/city-types";
import { CARD_ASPECT } from "@/lib/share-card";

type CityTypeCardProps = {
  card: File | null;
  type: CityType;
};

/** Showing the exported picture itself makes a screenshot and a saved file the same image. */
export function CityTypeCard({ card, type }: CityTypeCardProps) {
  const picture = useRef<HTMLImageElement>(null);
  // A dropped illustration must never end the result flow, so the card falls back
  // to a typography panel and stops rendering the image element entirely.
  const [imageFailed, setImageFailed] = useState(false);

  // The address is set on the element instead of through state so every run of this
  // effect mints its own url; a shared one would already be revoked on the second run.
  useEffect(() => {
    const node = picture.current;
    if (!card || !node) return;

    const url = URL.createObjectURL(card);
    node.src = url;

    return () => URL.revokeObjectURL(url);
  }, [card]);

  if (card) {
    return (
      <figure className="overflow-hidden rounded-[30px] shadow-[0_18px_50px_rgba(23,25,26,0.12)]">
        {/* The ratio holds the box open while the png decodes, so nothing below shifts. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={`${type.nickname} 유형 카드`}
          className="block w-full"
          ref={picture}
          style={{ aspectRatio: CARD_ASPECT }}
        />
      </figure>
    );
  }

  return (
    <div className="overflow-hidden rounded-[30px] bg-card shadow-[0_18px_50px_rgba(23,25,26,0.12)]">
      {imageFailed ? (
        <div className="flex min-h-44 items-center justify-center bg-secondary px-6 py-10">
          <h2 className="text-center text-[26px] leading-9 font-black tracking-[-0.03em] text-primary">
            {type.nickname}
          </h2>
        </div>
      ) : (
        // A stamp sheet loses its border the moment it is cropped, so the asset is
        // fitted whole into the fixed slot and any leftover margin keeps the card
        // background rather than reading as a band.
        <Image
          alt={`${type.nickname} 유형 일러스트`}
          className="h-auto w-full bg-card object-contain"
          height={TYPE_IMAGE_HEIGHT}
          onError={() => setImageFailed(true)}
          priority
          src={type.image}
          style={{
            aspectRatio: `${TYPE_IMAGE_WIDTH} / ${TYPE_IMAGE_HEIGHT}`,
          }}
          unoptimized
          width={TYPE_IMAGE_WIDTH}
        />
      )}
    </div>
  );
}
