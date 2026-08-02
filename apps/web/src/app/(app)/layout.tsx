import { Suspense } from "react";
import { AppShell } from "../../components/app-shell";
import { AiAssistant } from "../../components/ai-assistant";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppShell>
        {children}
        <AiAssistant />
      </AppShell>
    </Suspense>
  );
}
