import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Solo para titulos de pagina y de seccion. Existe en un solo peso (ExtraLight):
// en tamaños chicos se pierde, por eso no va en titulos de dialogos ni listas.
const stackSansNotch = localFont({
  src: "../fonts/StackSansNotch-ExtraLight.woff2",
  variable: "--font-stack-notch",
  weight: "200",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Creativos",
  description: "Inventario y control de producción de creativos.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${stackSansNotch.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
