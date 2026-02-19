'use client';

import { useRouter } from 'next/navigation';
import React, { useState, useEffect } from 'react';
import styles from '../styles/Home.module.css';

export default function Page() {
  const router = useRouter();
  const [authCode, setAuthCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [userName, setUserName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTelegramWebView, setIsTelegramWebView] = useState(false);

  useEffect(() => {
    // 检测是否在 Telegram WebView 中
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.initData) {
      setIsTelegramWebView(true);
    }
  }, []);

  const openInExternalBrowser = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.openLink) {
      tg.openLink(window.location.origin);
    } else {
      window.open(window.location.origin, '_blank');
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedAuth = authCode.trim();
    const trimmedRoom = roomName.trim();
    const trimmedName = userName.trim() || `用户${Date.now() % 10000}`;

    if (!trimmedAuth) {
      setError('请输入授权码');
      return;
    }
    if (!trimmedRoom) {
      setError('请输入房间名称');
      return;
    }

    setLoading(true);
    router.push(
      `/rooms/${encodeURIComponent(trimmedRoom)}?participantName=${encodeURIComponent(trimmedName)}&authCode=${encodeURIComponent(trimmedAuth)}`,
    );
  };

  return (
    <main className={styles.main} data-lk-theme="default">
      <div className="header">
        <img
          src="/images/yunjihuiyi-logo.png"
          alt="云际会议"
          style={{ width: '80px', height: '80px', display: 'block', margin: '0 auto 0.5rem' }}
        />
        <h1 style={{ fontSize: '2rem', textAlign: 'center', margin: '0 0 0.5rem' }}>
          云际会议
        </h1>
        <h2 style={{ margin: 0 }}>安全、高效的在线视频会议</h2>
      </div>

      {isTelegramWebView && (
        <div style={{
          width: '100%',
          maxWidth: '500px',
          paddingInline: '2rem',
          marginBottom: '0rem',
          boxSizing: 'border-box',
        }}>
        <div style={{
          background: 'rgba(255, 200, 50, 0.1)',
          border: '1px solid rgba(255, 200, 50, 0.3)',
          borderRadius: '0.5rem',
          padding: '1.5rem',
        }}>
          <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem', color: '#FFD700', textAlign: 'center' }}>
            📱 屏幕共享支持情况
          </p>
          <div style={{ fontSize: '0.8rem', lineHeight: '1.8', color: '#ccc' }}>
            <p style={{ margin: 0 }}>✅ 电脑浏览器（Chrome / Edge / Firefox）</p>
            <p style={{ margin: 0 }}>✅ 安卓手机浏览器</p>
            <p style={{ margin: 0 }}>✅ iPad Safari（iPadOS 16+）</p>
            <p style={{ margin: '0.3rem 0 0', color: '#ff9999' }}>
              ❌ 由于 iOS 官方限制，iPhone 所有浏览器均不支持屏幕共享
            </p>
            <p style={{ margin: '0.1rem 0 0', color: '#88ccff' }}>
              💡 iPhone 用户请下载原生 App 使用完整功能
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
            <button
              className="lk-button"
              onClick={openInExternalBrowser}
              style={{
                flex: 1,
                paddingBlock: '0.6rem',
                fontSize: '0.85rem',
                background: 'rgba(255, 200, 50, 0.2)',
                border: '1px solid rgba(255, 200, 50, 0.5)',
              }}
            >
              🌐 在浏览器中打开
            </button>
            <button
              className="lk-button"
              onClick={() => {
                const tg = (window as any).Telegram?.WebApp;
                if (tg?.openLink) {
                  tg.openLink('https://www.xn--9kqwmy46m13i.cn');
                } else {
                  window.open('https://www.xn--9kqwmy46m13i.cn', '_blank');
                }
              }}
              style={{
                flex: 1,
                paddingBlock: '0.6rem',
                fontSize: '0.85rem',
                background: 'rgba(100, 200, 255, 0.2)',
                border: '1px solid rgba(100, 200, 255, 0.5)',
              }}
            >
              📥 下载原生 App
            </button>
          </div>
        </div>
        </div>
      )}

      <div className={styles.tabContainer}>
        <form className={styles.tabContent} onSubmit={handleJoin}>
          <label htmlFor="authCode" style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            授权码
          </label>
          <input
            id="authCode"
            type="text"
            placeholder="请输入授权码"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value)}
            required
            style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '0.375rem' }}
          />

          <label htmlFor="roomName" style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '0.5rem' }}>
            房间名称
          </label>
          <input
            id="roomName"
            type="text"
            placeholder="请输入房间名称"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            required
            style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '0.375rem' }}
          />

          <label
            htmlFor="userName"
            style={{ fontWeight: 600, fontSize: '0.9rem', marginTop: '0.5rem' }}
          >
            昵称（可选）
          </label>
          <input
            id="userName"
            type="text"
            placeholder="显示在会议中的名字"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ padding: '0.75rem', fontSize: '1rem', borderRadius: '0.375rem' }}
          />

          {error && (
            <p style={{ color: '#ff6b6b', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>{error}</p>
          )}

          <button
            className="lk-button"
            type="submit"
            disabled={loading}
            style={{
              marginTop: '1rem',
              width: '100%',
              paddingBlock: '0.75rem',
              fontSize: '1rem',
            }}
          >
            {loading ? '正在连接...' : '加入会议'}
          </button>
        </form>
      </div>
    </main>
  );
}
