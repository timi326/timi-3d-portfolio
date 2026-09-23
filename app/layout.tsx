import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://timi.store'),
  title: 'Timi Studio — AI 创作房间',
  description: '陈楚涛的 AI 创作公寓，一间可以自由行走探索的温柔三维空间。',
  openGraph: {
    title: 'Timi Studio — AI 创作房间',
    description: '陈楚涛的 AI 创作公寓，一间可以自由行走探索的温柔三维空间。',
    images: [{ url: '/og.png', width: 1729, height: 910, alt: 'Timi 的三维 AI 创作房间' }],
    locale: 'zh_CN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Timi Studio — AI 创作房间',
    description: '陈楚涛的 AI 创作公寓，一间可以自由行走探索的温柔三维空间。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
