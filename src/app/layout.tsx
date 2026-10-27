import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VurKac Pro – Immobilien-Metasuchmaschine & Investment-Analyse",
  description:
    "VurKac Pro: Aggregierte Immobilien-Metasuchmaschine mit Dubletten-Erkennung, Preishistorie und Echtzeit-Cashflow-Engine für Kapitalanleger.",
  icons: {
    icon: "/vurkac-logo.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-[#f8fafc] text-slate-800 antialiased selection:bg-indigo-100 selection:text-indigo-900">
        {children}
      </body>
    </html>
  );
}
