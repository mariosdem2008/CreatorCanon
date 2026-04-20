import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import { JetBrains_Mono, Newsreader } from 'next/font/google';

export const geistSans = GeistSans;
export const geistMono = GeistMono;

export const newsreader = Newsreader({
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['300', '400', '500'],
  display: 'swap',
  variable: '--font-newsreader',
  preload: true,
  adjustFontFallback: false,
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
  preload: false,
});
