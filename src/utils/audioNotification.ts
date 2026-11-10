/**
 * Browser Push Notification & Audio Chime Utility
 * Synthesizes a clean two-tone medical reminder chime via Web Audio API.
 */

class AudioNotificationManager {
  private audioCtx: AudioContext | null = null;

  private initAudio() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // Play a soft, pleasant two-tone medical dosage reminder chime
  playReminderChime() {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;

      // First tone (587.33 Hz - D5)
      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.45);

      // Second tone higher pitch (880 Hz - A5)
      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880.0, now + 0.15);
      gain2.gain.setValueAtTime(0, now + 0.15);
      gain2.gain.linearRampToValueAtTime(0.25, now + 0.2);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.75);
    } catch (e) {
      console.warn('Audio chime playback failed:', e);
    }
  }

  // Play an urgent safety alert triple-chime
  playEmergencyAlertTone() {
    try {
      this.initAudio();
      if (!this.audioCtx) return;

      const now = this.audioCtx.currentTime;
      [0, 0.2, 0.4].forEach((delay) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(740, now + delay);
        gain.gain.setValueAtTime(0.25, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + delay);
        osc.stop(now + delay + 0.2);
      });
    } catch (e) {
      console.warn('Alert tone playback failed:', e);
    }
  }

  // Request browser notification permission
  async requestPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }
    try {
      const permission = await Notification.requestPermission();
      return permission;
    } catch {
      return 'denied';
    }
  }

  getPermissionStatus(): NotificationPermission {
    if (!('Notification' in window)) {
      return 'denied';
    }
    return Notification.permission;
  }

  // Dispatch browser push notification with sound
  sendPushNotification(title: string, options?: NotificationOptions): Notification | null {
    this.playReminderChime();

    if (!('Notification' in window)) {
      return null;
    }

    if (Notification.permission === 'granted') {
      try {
        const notif = new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...options,
        });

        notif.onclick = () => {
          window.focus();
          notif.close();
        };

        return notif;
      } catch (e) {
        console.warn('Native notification failed:', e);
        return null;
      }
    }
    return null;
  }
}

export const notificationService = new AudioNotificationManager();
