/**
 * Root Layout
 *
 * Global layout wrapping all pages. Handles:
 * - Metadata for SEO and PWA manifest
 * - Global CSS import
 * - Font loading (Pretendard)
 * - Viewport configuration for mobile PWA
 *
 * NOTE: PwaProvider temporarily disabled to debug hydration failure.
 */

import type { Metadata, Viewport } from 'next';
// TODO: Re-enable PwaProvider after hydration issue is resolved
// import { PwaProvider } from '@/components/pwa/pwa-provider';
import './globals.css';

export const metadata: Metadata = {
    title: {
      default: 'HelloNext - Golf Coaching Platform',
          template: '%s | HelloNext',
    },
    description: 'AI Golf Coaching Platform',
    applicationName: 'HelloNext',
    keywords: ['golf', 'coaching', 'golf lessons', 'swing analysis'],
    manifest: '/manifest.json',
    icons: {
          icon: '/favicon.ico',
          shortcut: '/favicon.ico',
          apple: '/apple-touch-icon.png',
    },
    appleWebApp: {
          capable: true,
          statusBarStyle: 'black-translucent',
          title: 'HelloNext',
    },
    formatDetection: {
          telephone: false,
    },
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    viewportFit: 'cover',
    themeColor: '#22c55e',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
          <html lang="ko" suppressHydrationWarning>
                <head>
                        <meta charSet="utf-8" />
                        <meta httpEquiv="x-ua-compatible" content="IE=edge" />
                        <meta name="apple-mobile-web-app-capable" content="yes" />
                        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                        <link rel="preconnect" href="https://fonts.googleapis.com" />
                        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
                </head>head>
                <body className="min-h-screen bg-surface text-text-primary">
                  {children}
                </body>body>
          </html>html>
        );
}</html>
