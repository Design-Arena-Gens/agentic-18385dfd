"use client";

import "./globals.css";
import { useEffect, useState } from "react";

const inter = {
  variable: "--font-inter"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    setThemeReady(true);
  }, []);

  return (
    <html lang="en" className={inter.variable}>
      <body style={{ opacity: themeReady ? 1 : 0, transition: "opacity 0.3s ease" }}>
        {children}
      </body>
    </html>
  );
}
