import type { Metadata } from "next";
import { Fraunces, Space_Grotesk } from "next/font/google";
import { ClerkProvider, SignInButton, UserButton, Show } from '@clerk/nextjs'
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-display",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Sahayak | Smart Resource Allocation",
  description: "Data-driven volunteer coordination for social impact.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${fraunces.variable} font-sans antialiased`}>
        <ClerkProvider
          appearance={{
            layout: {
              socialButtonsPlacement: "top",
              socialButtonsVariant: "blockButton",
            },
          }}
        >
          <header className="flex justify-between items-center p-4 gap-4 h-16 bg-white/50 backdrop-blur-md border-b border-gray-200">
            <div className="font-display font-bold text-xl text-slate-800">Sahayak</div>
            <div className="flex gap-4 items-center">
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="flex items-center gap-2 bg-white border border-gray-300 text-slate-700 rounded-full font-medium text-sm h-10 px-5 cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm">
                    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                      <g fill="none" fillRule="evenodd">
                        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                        <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                        <path d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                      </g>
                    </svg>
                    Sign in with Google
                  </button>
                </SignInButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>
          <main className="min-h-[calc(100vh-4rem)]">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}
