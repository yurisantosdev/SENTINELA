import "./globals.css";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("sentinela-theme")==="light"){document.documentElement.dataset.theme="light"}}catch(e){}`,
          }}
        />
        {children}
      </body>
    </html>
  );
}