import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { Bodoni_Moda, Montserrat, Playfair_Display } from 'next/font/google';
import Footer from '@/components/Footer';
import Navbar from '@/components/Navbar';
import './globals.css';

const sans = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-sans' });
const serif = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '800'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
});

// Wordmark face: a fashion-house Didone that contrasts with Montserrat's geometric sans.
const brand = Bodoni_Moda({ subsets: ['latin'], weight: ['800'], variable: '--font-brand' });

export const metadata: Metadata = {
  title: { default: 'LUCID Clothing', template: '%s | LUCID' },
  description: 'Breezy linen styles for warm summer days',
};

// Applied before paint so the stored theme never flashes.
const themeScript = `try{document.documentElement.setAttribute('data-theme',localStorage.getItem('lucid-theme')||'light')}catch{}`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${brand.variable}`} suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
