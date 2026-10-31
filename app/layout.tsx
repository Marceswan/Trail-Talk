import type { Metadata } from 'next';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';

const title = 'TrailTalk — Your people. Your platform.';
const description = 'A community for Salesforce people. Ask questions, share what you build, and find your next big idea.';
const socialImage = {
  url: '/social/trailtalk-card-v1.jpg',
  width: 1200,
  height: 630,
  alt: 'TrailTalk — Your people. Your platform. A winding trail through blue mountains and evergreen forests.',
};

export const metadata: Metadata = {
  metadataBase: new URL('https://trail-talk-delta.vercel.app'),
  title,
  description,
  openGraph: {
    type: 'website',
    siteName: 'TrailTalk',
    title,
    description,
    images: [{ ...socialImage, type: 'image/jpeg' }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [socialImage],
  },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
