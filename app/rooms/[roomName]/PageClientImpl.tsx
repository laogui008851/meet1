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

  const handleError = React.useCallback((error: Error) => {
    console.error(error);
    alert('遇到错误: ' + error.message);
  }, []);

  React.useEffect(() => {
    room.on(RoomEvent.Disconnected, handleOnLeave);
    room.on(RoomEvent.MediaDevicesError, handleError);

    room
      .connect(
        props.connectionDetails.serverUrl,
        props.connectionDetails.participantToken,
        connectOptions,
      )
      .then(() => {
        room.localParticipant.setCameraEnabled(true).catch(handleError);
        room.localParticipant.setMicrophoneEnabled(true).catch(handleError);
      })
      .catch(handleError);

    return () => {
      room.off(RoomEvent.Disconnected, handleOnLeave);
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
