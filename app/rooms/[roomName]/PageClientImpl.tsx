'use client';

import React from 'react';
import { KeyboardShortcuts } from '@/lib/KeyboardShortcuts';
import { SettingsMenu } from '@/lib/SettingsMenu';
import { ConnectionDetails } from '@/lib/types';
import {
  formatChatMessageLinks,
  RoomContext,
  VideoConference,
} from '@livekit/components-react';
import {
  RoomOptions,
  VideoCodec,
  VideoPresets,
  Room,
  RoomConnectOptions,
  RoomEvent,
  TrackPublishDefaults,
  VideoCaptureOptions,
} from 'livekit-client';
import { useRouter } from 'next/navigation';
import { useLowCPUOptimizer } from '@/lib/usePerfomanceOptimiser';

const CONN_DETAILS_ENDPOINT =
  process.env.NEXT_PUBLIC_CONN_DETAILS_ENDPOINT ?? '/api/connection-details';
const SHOW_SETTINGS_MENU = process.env.NEXT_PUBLIC_SHOW_SETTINGS_MENU == 'true';

export function PageClientImpl(props: {
  roomName: string;
  region?: string;
  hq: boolean;
  codec: VideoCodec;
  participantName: string;
  authCode: string;
}) {
  const [connectionDetails, setConnectionDetails] = React.useState<ConnectionDetails | undefined>(
    undefined,
  );
  const [authError, setAuthError] = React.useState<string | undefined>(undefined);
  const router = useRouter();

  React.useEffect(() => {
    const fetchDetails = async () => {
      const url = new URL(CONN_DETAILS_ENDPOINT, window.location.origin);
      url.searchParams.append('roomName', props.roomName);
      url.searchParams.append('participantName', props.participantName || '用户');
      url.searchParams.append('authCode', props.authCode);
      if (props.region) {
        url.searchParams.append('region', props.region);
      }
      const resp = await fetch(url.toString());
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({ error: '连接失败' }));
        setAuthError(errData.error || `错误 ${resp.status}`);
        return;
      }
      const data = await resp.json();
      setConnectionDetails(data);
    };
    fetchDetails();
  }, [props.roomName, props.participantName, props.region, props.authCode]);

  if (authError) {
    return (
      <main data-lk-theme="default" style={{ height: '100%' }}>
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.2rem', color: '#ff6b6b' }}>❌ {authError}</p>
            <button
              className="lk-button"
              onClick={() => router.push('/')}
              style={{ marginTop: '1rem' }}
            >
              返回首页
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (!connectionDetails) {
    return (
      <main data-lk-theme="default" style={{ height: '100%' }}>
        <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
          <p style={{ fontSize: '1.1rem', opacity: 0.7 }}>正在连接会议...</p>
        </div>
      </main>
    );
  }

  return (
    <main data-lk-theme="default" style={{ height: '100%' }}>
      <VideoConferenceComponent
        connectionDetails={connectionDetails}
        participantName={props.participantName}
        options={{ codec: props.codec, hq: props.hq }}
      />
    </main>
  );
}

function VideoConferenceComponent(props: {
  participantName: string;
  connectionDetails: ConnectionDetails;
  options: {
    hq: boolean;
    codec: VideoCodec;
  };
}) {
  const roomOptions = React.useMemo((): RoomOptions => {
    const videoCodec: VideoCodec | undefined = props.options.codec ? props.options.codec : 'vp9';
    const videoCaptureDefaults: VideoCaptureOptions = {
      resolution: props.options.hq ? VideoPresets.h2160 : VideoPresets.h720,
    };
    const publishDefaults: TrackPublishDefaults = {
      dtx: false,
      videoSimulcastLayers: props.options.hq
        ? [VideoPresets.h1080, VideoPresets.h720]
        : [VideoPresets.h540, VideoPresets.h216],
      red: true,
      videoCodec,
    };
    return {
      videoCaptureDefaults,
      publishDefaults,
      adaptiveStream: true,
      dynacast: true,
      singlePeerConnection: true,
    };
  }, [props.options.hq, props.options.codec]);

  const room = React.useMemo(() => new Room(roomOptions), []);

  const connectOptions = React.useMemo((): RoomConnectOptions => {
    return {
      autoSubscribe: true,
    };
  }, []);

  const router = useRouter();

  // 获取 authCode 用于 leave / heartbeat
  const authCodeRef = React.useRef(
    new URLSearchParams(window.location.search).get('authCode') || '',
  );

  // 用 sendBeacon 可靠释放授权码（即使页面正在关闭也能发出）
  const sendLeaveBeacon = React.useCallback(() => {
    const code = authCodeRef.current;
    if (!code) return;
    const body = JSON.stringify({ authCode: code });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/leave', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/leave', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  const handleOnLeave = React.useCallback(() => {
    sendLeaveBeacon();
    router.push('/');
  }, [router, sendLeaveBeacon]);

  // beforeunload / pagehide → 用 sendBeacon 释放授权码
  React.useEffect(() => {
    const onUnload = () => sendLeaveBeacon();
    window.addEventListener('beforeunload', onUnload);
    window.addEventListener('pagehide', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('pagehide', onUnload);
    };
  }, [sendLeaveBeacon]);

  // 心跳：每60秒刷新 in_use_since，防止活跃会议被误判超时
  React.useEffect(() => {
    const code = authCodeRef.current;
    if (!code) return;
    const interval = setInterval(() => {
      fetch('/api/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authCode: code }),
      }).catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const [usingFallback, setUsingFallback] = React.useState(false);
  const [reconnecting, setReconnecting] = React.useState(false);

  const handleError = React.useCallback((error: Error) => {
    console.error(error);
    alert('遇到错误: ' + error.message);
  }, []);

  // 连接到指定服务器（主/备用）
  const connectToServer = React.useCallback(
    async (url: string, token: string, label: string) => {
      console.log(`[LiveKit] 正在连接${label}:`, url);
      await room.connect(url, token, connectOptions);
      console.log(`[LiveKit] ✅ ${label}连接成功`);
    },
    [room, connectOptions],
  );

  // 尝试切换到备用服务器
  const switchToFallback = React.useCallback(async () => {
    const { fallbackServerUrl, fallbackParticipantToken } = props.connectionDetails;
    if (!fallbackServerUrl || !fallbackParticipantToken || usingFallback) return false;

    try {
      setReconnecting(true);
      // 先断开当前连接
      await room.disconnect(true);
      await connectToServer(fallbackServerUrl, fallbackParticipantToken, '备用服务器');
      setUsingFallback(true);
      setReconnecting(false);
      // 重新开启摄像头和麦克风
      room.localParticipant.setCameraEnabled(true).catch(handleError);
      room.localParticipant.setMicrophoneEnabled(true).catch(handleError);
      return true;
    } catch (err) {
      console.error('[LiveKit] ❌ 备用服务器也连接失败:', err);
      setReconnecting(false);
      return false;
    }
  }, [room, props.connectionDetails, usingFallback, connectToServer, handleError]);

  React.useEffect(() => {
    // 会中断线处理：主服务器断线时自动切备用
    const handleDisconnect = async () => {
      const { fallbackServerUrl, fallbackParticipantToken } = props.connectionDetails;

      // 如果当前在主服务器、且有备用线路可用 → 自动切换
      if (!usingFallback && fallbackServerUrl && fallbackParticipantToken) {
        console.warn('[LiveKit] ⚠️ 主服务器断线，正在自动切换到备用服务器...');
        const ok = await switchToFallback();
        if (ok) {
          console.log('[LiveKit] ✅ 已自动切换到备用服务器');
          return; // 切换成功，不跳转
        }
      }
      // 备用也断了 或 已在备用上断线 → 正常离开
      handleOnLeave();
    };

    room.on(RoomEvent.Disconnected, handleDisconnect);
    room.on(RoomEvent.MediaDevicesError, handleError);

    const connectWithFallback = async () => {
      const { serverUrl, participantToken, fallbackServerUrl, fallbackParticipantToken } =
        props.connectionDetails;

      try {
        await connectToServer(serverUrl, participantToken, '主服务器');
      } catch (primaryError) {
        console.warn('[LiveKit] ❌ 主服务器连接失败:', primaryError);

        if (fallbackServerUrl && fallbackParticipantToken) {
          try {
            await connectToServer(fallbackServerUrl, fallbackParticipantToken, '备用服务器');
            setUsingFallback(true);
          } catch (fallbackError) {
            console.error('[LiveKit] ❌ 备用服务器也连接失败:', fallbackError);
            handleError(new Error('所有服务器均无法连接，请稍后重试'));
            return;
          }
        } else {
          handleError(primaryError as Error);
          return;
        }
      }

      room.localParticipant.setCameraEnabled(true).catch(handleError);
      room.localParticipant.setMicrophoneEnabled(true).catch(handleError);
    };

    connectWithFallback();

    return () => {
      room.off(RoomEvent.Disconnected, handleDisconnect);
      room.off(RoomEvent.MediaDevicesError, handleError);
    };
  }, [room, props.connectionDetails]);

  const lowPowerMode = useLowCPUOptimizer(room);

  React.useEffect(() => {
    if (lowPowerMode) {
      console.warn('Low power mode enabled');
    }
  }, [lowPowerMode]);

  return (
    <div className="lk-room-container">
      {reconnecting && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 9999,
            background: 'rgba(255, 165, 0, 0.9)',
            color: '#fff',
            textAlign: 'center',
            padding: '8px',
            fontSize: '14px',
          }}
        >
          🔄 主服务器断线，正在自动切换到备用服务器...
        </div>
      )}
      {usingFallback && !reconnecting && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 10,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            color: '#ffa500',
            padding: '4px 10px',
            borderRadius: '0 0 6px 6px',
            fontSize: '12px',
          }}
        >
          ⚡ 备用线路
        </div>
      )}
      <RoomContext.Provider value={room}>
        <KeyboardShortcuts />
        <VideoConference
          chatMessageFormatter={formatChatMessageLinks}
          SettingsComponent={SHOW_SETTINGS_MENU ? SettingsMenu : undefined}
        />
      </RoomContext.Provider>
    </div>
  );
}
