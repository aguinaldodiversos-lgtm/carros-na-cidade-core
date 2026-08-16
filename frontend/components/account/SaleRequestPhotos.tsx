"use client";

import { useRef, useState } from "react";
import {
  PHOTO_PRIVACY_NOTICE,
  SALE_REQUEST_PHOTOS,
  uploadSaleRequestPhotos,
  type UploadedPhoto,
} from "@/lib/sale-requests/api";

/**
 * Escolha e envio das fotos do veículo.
 *
 * As fotos sobem ASSIM QUE SÃO ESCOLHIDAS, antes do submit do formulário. O que
 * o formulário carrega depois é a lista de `storage_key` — nunca os arquivos.
 * Isso evita que um erro de validação de campo (ano errado, por exemplo) obrigue
 * a pessoa a reenviar 12 imagens.
 *
 * O aviso de privacidade não é decorativo: o bucket é servido publicamente, e
 * uma foto que mostra a placa ou a fachada da casa fica acessível a quem tiver a
 * URL, inclusive depois do cancelamento.
 */

const ACCEPT = "image/jpeg,image/png,image/webp";

export default function SaleRequestPhotos({
  photos,
  onChange,
  disabled = false,
  error,
}: {
  photos: UploadedPhoto[];
  onChange: (photos: UploadedPhoto[]) => void;
  disabled?: boolean;
  error?: string | null;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const remaining = SALE_REQUEST_PHOTOS.MAX - photos.length;

  async function handleFiles(fileList: FileList | null) {
    const chosen = Array.from(fileList ?? []);
    if (chosen.length === 0) return;

    setUploadError(null);

    // O corte acontece ANTES do upload: enviar 20 arquivos para receber um 400
    // gastaria a banda da pessoa para nada.
    if (chosen.length > remaining) {
      setUploadError(
        remaining === 0
          ? `Você já enviou o máximo de ${SALE_REQUEST_PHOTOS.MAX} fotos.`
          : `Você pode enviar mais ${remaining} foto(s).`
      );
      return;
    }

    setUploading(true);
    try {
      const uploaded = await uploadSaleRequestPhotos(chosen);
      onChange([...photos, ...uploaded]);
    } catch (uploadFailure) {
      setUploadError(
        uploadFailure instanceof Error
          ? uploadFailure.message
          : "Não foi possível enviar as fotos."
      );
    } finally {
      setUploading(false);
      // Limpa o input para que escolher o MESMO arquivo de novo dispare o evento.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    // Só some da lista do formulário. O objeto no R2 permanece e vira órfão —
    // limpeza é trabalho de script, fora do request.
    onChange(photos.filter((_, position) => position !== index));
  }

  const shownError = error || uploadError;

  return (
    <div data-testid="sale-request-photos">
      <span className="mb-2 block text-sm font-semibold text-[#33405A]">
        Fotos do veículo ({photos.length}/{SALE_REQUEST_PHOTOS.MAX})
      </span>

      <p className="mb-3 text-xs leading-relaxed text-[#64748b]">
        Envie de {SALE_REQUEST_PHOTOS.MIN} a {SALE_REQUEST_PHOTOS.MAX} fotos: frente, traseira,
        lateral e interior ajudam as lojas a avaliar melhor.
      </p>

      <p
        className="mb-4 rounded-[12px] border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-xs leading-relaxed text-[#92400E]"
        data-testid="sale-request-photo-privacy"
      >
        {PHOTO_PRIVACY_NOTICE}
      </p>

      {photos.length > 0 ? (
        <ul className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((photo, index) => (
            <li
              key={photo.storage_key}
              className="relative overflow-hidden rounded-[14px] border border-[#E5E9F2] bg-[#F9FBFF]"
            >
              {/* `img` e não `next/image`: a URL vem do R2 em runtime e o
                  otimizador do Next exigiria configurar o host no build. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={index === 0 ? "Foto de capa do veículo" : `Foto ${index + 1} do veículo`}
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />

              {index === 0 ? (
                <span className="absolute left-2 top-2 rounded-full bg-[#0e62d8] px-2 py-0.5 text-[10px] font-bold text-white">
                  Capa
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled || uploading}
                aria-label={`Remover foto ${index + 1}`}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-sm font-bold text-[#b42318] shadow disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
        data-testid="sale-request-photo-input"
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading || remaining === 0}
        className="h-12 w-full rounded-[14px] border border-dashed border-[#1F66E5] bg-[#F5F9FF] px-4 text-sm font-bold text-[#0e62d8] transition hover:bg-[#EEF4FF] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:min-w-[240px]"
        data-testid="sale-request-photo-button"
      >
        {uploading ? "Enviando fotos…" : "Adicionar fotos"}
      </button>

      {shownError ? (
        <p className="mt-2 text-xs text-[#b42318]" role="alert">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}
