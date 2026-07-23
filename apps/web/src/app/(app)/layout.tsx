import { AppShell } from "../../components/app-shell";
import { AiAssistant } from "../../components/ai-assistant";

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      {children}
      <AiAssistant />
    </AppShell>
  );
}
