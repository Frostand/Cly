import { NextIntlClientProvider } from "next-intl";
import { IdeShell } from "../../../components/ide/ide-shell";
import { useIdeStore } from "../../../components/ide/ide-store";
import { messages } from "../../../i18n/messages";

export function LiveDevWorkspaceScreen() {
  const locale = useIdeStore((state) => state.settings.locale);

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <section
        aria-label="Cly Dev AI workspace"
        className="cly-live-dev-workspace"
        data-testid="cly-live-dev-workspace"
      >
        <IdeShell embedded />
      </section>
    </NextIntlClientProvider>
  );
}
