import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, IBM_Plex_Sans_Arabic, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { PrefsProvider, type Lang } from "@/lib/i18n";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/shell/app-shell";
import { DEFAULT_MODEL_KEY } from "@/lib/ai/models";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["300", "400", "500", "600"] });
const arabic = IBM_Plex_Sans_Arabic({ variable: "--font-arabic", subsets: ["arabic"], weight: ["300", "400", "500", "600"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "NARVO — Private Intelligence",
  description: "Private, customizable AI systems — every solution running on-device.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const jar = await cookies();
  const lang: Lang = jar.get("narvo-lang")?.value === "ar" ? "ar" : "en";
  const model = jar.get("narvo-model")?.value || DEFAULT_MODEL_KEY;
  return (
    <html
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      className={`${inter.variable} ${arabic.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden">
        <PrefsProvider initialLang={lang} initialModel={model}>
          <TooltipProvider delayDuration={200}>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
          <Toaster position="bottom-right" toastOptions={{ className: "!rounded-lg !border-border !text-[13px]" }} />
        </PrefsProvider>
      </body>
    </html>
  );
}
