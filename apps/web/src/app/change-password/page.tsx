"use client";
import { BrandLogo, Button, Input } from "@sgc/ui";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = String(form.get("newPassword") ?? "");
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
    <main className="grid min-h-screen place-items-center bg-[var(--brand-surface)] p-4">
      <form
        className="grid w-full max-w-md gap-4 rounded-lg border border-[var(--brand-border)] bg-white p-6 shadow-xl"
        onSubmit={(event) => void submit(event)}
      >
        <BrandLogo />
        <div>
          <h1 className="text-3xl font-semibold text-[var(--brand-primary)]">
            Crie sua senha definitiva
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Esta credencial temporaria precisa ser substituida antes de continuar.
          </p>
        </div>
        {error ? <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        <Input name="currentPassword" label="Senha temporaria" type="password" required />
        <Input name="newPassword" label="Nova senha" type="password" minLength={12} required />
        <Input
          name="confirmPassword"
          label="Confirmar nova senha"
          type="password"
          minLength={12}
          required
        />
        <Button type="submit" disabled={loading}>
          {loading ? "Alterando..." : "Definir nova senha"}
        </Button>
      </form>
    </main>
  );
}
