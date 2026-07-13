"use client";
import { BrandLogo, Button } from "@sgc/ui";
import { Eye, EyeOff } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nextEntry = form.get("newPassword");
    const next = typeof nextEntry === "string" ? nextEntry : "";
    if (next !== form.get("confirmPassword")) {
      setError("As novas senhas nao conferem.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: next }),
      });
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel alterar a senha.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <main className="auth-page grid min-h-screen place-items-center p-4">
      <form
        className="auth-panel grid w-full max-w-md gap-4 rounded-xl border border-[var(--brand-border)] bg-white p-6 shadow-xl"
        onSubmit={(event) => void submit(event)}
      >
        <div className="auth-brand-light">
          <BrandLogo />
        </div>
        <div className="auth-brand-dark">
          <BrandLogo theme="dark" />
        </div>
        <div>
          <h1 className="text-3xl font-semibold text-[var(--brand-primary)]">
            Crie sua senha definitiva
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Esta credencial temporaria precisa ser substituida antes de continuar.
          </p>
        </div>
        {error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        <PasswordField
          name="currentPassword"
          label="Senha temporaria"
          visible={visible.currentPassword}
          onToggle={() =>
            setVisible((value) => ({ ...value, currentPassword: !value.currentPassword }))
          }
        />
        <PasswordField
          name="newPassword"
          label="Nova senha"
          minLength={8}
          visible={visible.newPassword}
          onToggle={() => setVisible((value) => ({ ...value, newPassword: !value.newPassword }))}
        />
        <PasswordField
          name="confirmPassword"
          label="Confirmar nova senha"
          minLength={8}
          visible={visible.confirmPassword}
          onToggle={() =>
            setVisible((value) => ({ ...value, confirmPassword: !value.confirmPassword }))
          }
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Alterando..." : "Definir nova senha"}
        </Button>
        <p className="text-xs leading-5 text-slate-500">
          Use ao menos 8 caracteres, com uma letra maiúscula, um número e um caractere especial.
        </p>
      </form>
    </main>
  );
}

function PasswordField({
  name,
  label,
  minLength,
  visible,
  onToggle,
}: {
  name: string;
  label: string;
  minLength?: number;
  visible?: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-slate-700" htmlFor={name}>
      <span className="font-medium">{label}</span>
      <span className="relative">
        <input
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={name === "currentPassword" ? "current-password" : "new-password"}
          minLength={minLength}
          required
          className="h-10 w-full rounded-md border border-[var(--brand-border)] bg-white px-3 pr-11 text-sm text-slate-950 outline-none transition focus:border-[var(--brand-accent)] focus:ring-2 focus:ring-[color:rgba(245,195,74,0.2)]"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-slate-500 transition hover:text-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-accent)]"
          onClick={onToggle}
          aria-label={visible ? `Ocultar ${label.toLowerCase()}` : `Mostrar ${label.toLowerCase()}`}
          title={visible ? "Ocultar senha" : "Mostrar senha"}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}
