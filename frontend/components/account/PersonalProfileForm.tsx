"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { PersonalProfile } from "@/lib/account/backend-account";

function formatCpf(value: string) {
  const numbers = value.replace(/\D/g, "");
  return numbers.length === 11
    ? numbers.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
    : value;
}

function phoneIsValid(value: string) {
  let digits = value.replace(/\D/g, "");
  if (!digits) return true;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  return (
    (digits.length === 10 || digits.length === 11) &&
    Number(digits.slice(0, 2)) >= 11 &&
    Number(digits.slice(0, 2)) <= 99 &&
    (digits.length !== 11 || digits[2] === "9")
  );
}

const fieldClass =
  "h-12 w-full rounded-xl border border-[#D8E0EC] bg-white px-3.5 text-sm text-[#182848] outline-none focus:border-[#1763D6] focus:ring-2 focus:ring-[#1763D6]/10";
const readOnlyClass =
  "h-12 w-full rounded-xl border border-[#E1E7F0] bg-[#F5F7FA] px-3.5 text-sm text-[#52617B]";
const labelClass = "mb-1.5 block text-xs font-bold text-[#344460]";

function ProtectedField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        aria-label={label}
        type="text"
        value={value || "Não informado"}
        readOnly
        className={readOnlyClass}
      />
      {hint ? <span className="mt-1.5 block text-xs text-[#718099]">{hint}</span> : null}
    </label>
  );
}

export default function PersonalProfileForm({ initial }: { initial: PersonalProfile }) {
  const [phone, setPhone] = useState(initial.phone);
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp);
  const [address, setAddress] = useState(initial.address);
  const [saved, setSaved] = useState({
    phone: initial.phone,
    whatsapp: initial.whatsapp,
    address: initial.address,
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const valid = phoneIsValid(phone) && phoneIsValid(whatsapp) && address.trim().length <= 300;
  const changed =
    phone !== saved.phone || whatsapp !== saved.whatsapp || address !== saved.address;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/account/personal", {
        method: "PUT",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, whatsapp, address }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        profile?: PersonalProfile;
        message?: string;
        error?: string;
      };
      if (!response.ok || body.success !== true || !body.profile) {
        throw new Error(body.message || body.error || "Não foi possível salvar seus dados.");
      }
      setSaved({
        phone: body.profile.phone,
        whatsapp: body.profile.whatsapp,
        address: body.profile.address,
      });
      setPhone(body.profile.phone);
      setWhatsapp(body.profile.whatsapp);
      setAddress(body.profile.address);
      setFeedback({ ok: true, message: "Dados de contato atualizados com sucesso." });
    } catch (error) {
      setFeedback({
        ok: false,
        message: error instanceof Error ? error.message : "Erro ao atualizar seus dados.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5" data-testid="pf-personal-profile">
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-4 rounded-2xl border border-[#E1E7F0] bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-base font-extrabold text-[#172646]">Dados da conta</h2>
            <p className="mt-1 text-xs text-[#697993]">
              Informações de identidade protegidas contra alterações diretas.
            </p>
          </div>
          <ProtectedField label="Nome completo" value={initial.name} />
          <ProtectedField label="E-mail de acesso" value={initial.email} />
          <ProtectedField
            label="CPF"
            value={formatCpf(initial.document.number)}
            hint="Para corrigir seus dados de identidade, entre em contato com o suporte."
          />
          <div className="border-t border-[#EEF1F6] pt-4 text-sm text-[#536680]">
            Quer trocar sua senha?{" "}
            <Link className="font-bold text-[#1763D6] hover:underline" href="/dashboard/senha">
              Alterar senha
            </Link>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[#E1E7F0] bg-white p-5 shadow-sm sm:p-6">
          <div>
            <h2 className="text-base font-extrabold text-[#172646]">Contato e localização</h2>
            <p className="mt-1 text-xs text-[#697993]">
              Atualize seu contato sem modificar a identidade da conta.
            </p>
          </div>
          <ProtectedField label="Cidade cadastrada" value={initial.city} />
          <label className="block">
            <span className={labelClass}>Telefone</span>
            <input
              type="tel"
              autoComplete="tel"
              aria-label="Telefone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="DDD + número"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>WhatsApp</span>
            <input
              type="tel"
              aria-label="WhatsApp"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="DDD + número"
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Endereço</span>
            <input
              type="text"
              autoComplete="street-address"
              aria-label="Endereço"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Rua, número e bairro"
              maxLength={300}
              className={fieldClass}
            />
          </label>
          {!valid ? (
            <p role="alert" className="text-xs font-semibold text-[#B42318]">
              Verifique os telefones (DDD + número) e o endereço.
            </p>
          ) : null}
        </section>
      </div>
      {feedback ? (
        <p
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            feedback.ok
              ? "border-[#B9E7CC] bg-[#F1FBF5] text-[#167545]"
              : "border-[#F2C9C9] bg-[#FFF4F4] text-[#AD2929]"
          }`}
        >
          {feedback.message}
        </p>
      ) : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving || !valid || !changed}
          className="min-h-11 rounded-xl bg-[#1763D6] px-6 text-sm font-bold text-white hover:bg-[#104CAE] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
