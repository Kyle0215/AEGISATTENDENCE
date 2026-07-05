import { useState, useCallback, useEffect } from 'react';

interface CameraCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  focusMode?: string[];
  focusDistance?: { min: number; max: number; step?: number };
}

export function useCameraControls(videoElement: HTMLVideoElement | null) {
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(null);

  // Initialize track and capabilities when video element or its stream changes
  useEffect(() => {
    if (!videoElement) return;

    const updateTrack = () => {
      const stream = videoElement.srcObject as MediaStream;
      if (stream) {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          const currentTrack = videoTracks[0];
          setTrack(currentTrack);
          if (typeof currentTrack.getCapabilities === 'function') {
            setCapabilities(currentTrack.getCapabilities() as CameraCapabilities);
          }
        }
      }
    };

    // Wait for the stream to be assigned to the video element
    const handleLoadedMetadata = () => {
      updateTrack();
    };

    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    // Initial check just in case it's already loaded
    if (videoElement.readyState >= 1) {
      updateTrack();
    }

    return () => {
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [videoElement]);

  const setZoom = useCallback(async (level: number): Promise<boolean> => {
    if (!track || !capabilities || !capabilities.zoom) {
      console.warn('Zoom is not supported by this camera or browser.');
      return false;
    }

    try {
      const { min, max } = capabilities.zoom;
      const zoomLevel = Math.max(min, Math.min(level, max));
      await track.applyConstraints({
        advanced: [{ zoom: zoomLevel } as any]
      });
      return true;
    } catch (err) {
      console.error('Failed to apply zoom constraint:', err);
      return false;
    }
  }, [track, capabilities]);

  const setFocus = useCallback(async (mode: 'continuous' | 'manual', distance?: number): Promise<boolean> => {
    if (!track || !capabilities || !capabilities.focusMode) {
      console.warn('Focus control is not supported by this camera or browser.');
      return false;
    }

    try {
      const advancedConstraints: any = { focusMode: mode };
      
      if (mode === 'manual' && distance !== undefined && capabilities.focusDistance) {
        const { min, max } = capabilities.focusDistance;
        advancedConstraints.focusDistance = Math.max(min, Math.min(distance, max));
      }

      await track.applyConstraints({
        advanced: [advancedConstraints]
      });
      return true;
    } catch (err) {
      console.error('Failed to apply focus constraint:', err);
      return false;
    }
  }, [track, capabilities]);

  return {
    capabilities,
    setZoom,
    setFocus,
    isZoomSupported: !!capabilities?.zoom,
    isFocusSupported: !!capabilities?.focusMode,
  };
}
