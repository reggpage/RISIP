import { useCallback, useEffect, useRef, useState } from 'react';
import { startScanner, type ScannerHandle } from './scanner';

// Owning a camera from React, which is harder than it looks.
//
// MEASURED FAILURE, and it cost the owner two rounds of testing. The page held
// the camera in an effect whose dependency list included a callback built from
// useToast() — and useToast() returns a NEW OBJECT ON EVERY RENDER. So the deps
// changed on every render, React ran the effect's cleanup (which stopped the
// camera) and then the body, which saw its "already started" guard and did not
// restart it. The camera opened, the very next state update killed it, and the
// screen went black. Every retry called getUserMedia again, which is why iOS
// asked for permission over and over.
//
// So the rule this hook exists to enforce: the camera is started ONCE, from an
// effect that depends on one boolean and nothing else. Everything the scan
// callback needs is read through a ref at call time, so no amount of
// re-rendering can reach the camera.

export type CameraState = 'starting' | 'live' | 'denied' | 'missing' | 'failed';

export type ScannerControls = {
  videoRef: React.RefObject<HTMLVideoElement>;
  camera: CameraState;
  torchOn: boolean;
  hasTorch: boolean;
  /** Frames drawn and codes decoded, for telling silent failures apart. */
  stats: { frames: number; decodes: number };
  toggleTorch: () => void;
  retry: () => void;
  pause: () => void;
  resume: () => void;
};

export function useScanner(active: boolean, onCode: (code: string) => void): ScannerControls {
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScannerHandle | null>(null);
  // The callback is read at call time, never captured in a dependency list.
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  const [camera, setCamera] = useState<CameraState>('starting');
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [stats, setStats] = useState({ frames: 0, decodes: 0 });

  const open = useCallback(async () => {
    handleRef.current?.stop();
    handleRef.current = null;
    setTorchOn(false);
    setHasTorch(false);
    setCamera('starting');
    const video = videoRef.current;
    if (!video) return;
    const handle = await startScanner({
      video,
      onCode: (found) => onCodeRef.current(found.code),
      onError: (why) => setCamera(why),
    });
    if (!handle) return;
    handleRef.current = handle;
    setHasTorch(handle.hasTorch());
    setCamera('live');
  }, []);

  // ONE dependency, and it changes at most once — see the note above.
  useEffect(() => {
    if (!active) return;
    void open();
    return () => {
      handleRef.current?.stop();
      handleRef.current = null;
    };
  }, [active, open]);

  // A heartbeat, not a render loop: the numbers only exist so the page can say
  // something useful when nothing is being decoded.
  useEffect(() => {
    if (!active) return;
    const tick = window.setInterval(() => {
      const current = handleRef.current?.stats();
      if (current) setStats(current);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [active]);

  return {
    videoRef,
    camera,
    torchOn,
    hasTorch,
    stats,
    toggleTorch: () => {
      const handle = handleRef.current;
      if (!handle) return;
      void handle.toggleTorch().then(setTorchOn).catch(() => setTorchOn(false));
    },
    retry: () => void open(),
    pause: () => handleRef.current?.pause(),
    resume: () => handleRef.current?.resume(),
  };
}
