import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "osu-gpt",
  description: "Turn your Spotify library into osu! beatmaps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the theme script below sets data-theme before
    // React hydrates, so the server and client html attributes can differ.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply the stored theme before first paint — no flash of dark. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}",
          }}
        />
      </head>
      <body className={openSans.variable}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
