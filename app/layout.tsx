import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: {
    default: '云际会议 | 安全高效的在线视频会议',
    template: '%s',
  },
  description:
    '云际会议 - 安全、高效的在线视频会议平台，支持多人音视频通话、屏幕共享、文字聊天。',
  openGraph: {
    siteName: '云际会议',
  },
  icons: {
    icon: {
      rel: 'icon',
      url: '/favicon.png',
      type: 'image/png',
    },
    apple: {
      url: '/images/yunjihuiyi-apple-touch.png',
    },
  },
};

export const viewport: Viewport = {
  themeColor: '#070707',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="https://telegram.org/js/telegram-web-app.js" defer></script>
      </head>
      <body data-lk-theme="default">
        <Toaster />
        {children}
      </body>
    </html>
  );
}
