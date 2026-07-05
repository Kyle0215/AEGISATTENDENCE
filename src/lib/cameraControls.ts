export class CameraControls {
  track: MediaStreamTrack | null = null;
  capabilities: MediaTrackCapabilities | null = null;

  constructor(stream: MediaStream | null) {
    if (stream) {
      this.init(stream);
    }
  }

  init(stream: MediaStream) {
    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length > 0) {
      this.track = videoTracks[0];
      // getCapabilities might not be supported in all browsers
      if (typeof this.track.getCapabilities === 'function') {
        this.capabilities = this.track.getCapabilities();
      }
    }
  }

  async setZoom(level: number): Promise<boolean> {
    if (!this.track || !this.capabilities || !('zoom' in this.capabilities)) {
      console.warn('Zoom is not supported by this camera or browser.');
      return false;
    }

    try {
      const zoomCaps = this.capabilities.zoom as any;
      const zoomLevel = Math.max(zoomCaps.min, Math.min(level, zoomCaps.max));
      await this.track.applyConstraints({
        advanced: [{ zoom: zoomLevel } as any]
      });
      return true;
    } catch (err) {
      console.error('Failed to apply zoom constraint:', err);
      return false;
    }
  }

  async setFocus(mode: 'continuous' | 'manual', distance?: number): Promise<boolean> {
    if (!this.track || !this.capabilities || !('focusMode' in this.capabilities)) {
      console.warn('Focus control is not supported by this camera or browser.');
      return false;
    }

    try {
      const advancedConstraints: any = { focusMode: mode };
      
      if (mode === 'manual' && distance !== undefined && 'focusDistance' in this.capabilities) {
        const focusCaps = this.capabilities.focusDistance as any;
        advancedConstraints.focusDistance = Math.max(focusCaps.min, Math.min(distance, focusCaps.max));
      }

      await this.track.applyConstraints({
        advanced: [advancedConstraints]
      });
      return true;
    } catch (err) {
      console.error('Failed to apply focus constraint:', err);
      return false;
    }
  }
}
