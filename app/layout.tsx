import "./globals.css";
import OfflineBanner from "@/components/OfflineBanner";
import DemoBadge from "@/components/DemoBadge";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import PushToggle from "@/components/PushToggle";
import { I18nProvider } from "@/lib/i18n";

export const metadata = {
  title: "WakeUp Projects",
  description: "WakeUp Projects — cleaning & maintenance platform",
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "WakeUp",
  },
};

export const viewport = {
  themeColor: "#111111",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>
          <OfflineBanner />
          {children}
          <PushToggle />
          <LanguageSwitcher />
          <DemoBadge />
        </I18nProvider>
      </body>
    </html>
  );
}
