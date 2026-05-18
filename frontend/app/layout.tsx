import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Private AI Knowledge Assistant",
    template: "%s | Private AI Knowledge Assistant",
  },
  description:
    "Enterprise-grade private AI knowledge assistant powered by RAG technology. Securely chat with your documents and knowledge base.",
  keywords: ["AI", "knowledge assistant", "RAG", "document search", "enterprise AI"],
  authors: [{ name: "Private AI Assistant" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    title: "Private AI Knowledge Assistant",
    description:
      "Enterprise-grade private AI knowledge assistant powered by RAG technology.",
    siteName: "Private AI Knowledge Assistant",
  },
  twitter: {
    card: "summary_large_image",
    title: "Private AI Knowledge Assistant",
    description:
      "Enterprise-grade private AI knowledge assistant powered by RAG technology.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="font-sans antialiased min-h-screen bg-background text-foreground">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
