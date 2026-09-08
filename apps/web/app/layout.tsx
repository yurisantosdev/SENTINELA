import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinela",
  description: "Painel de importação de dados CAT",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
