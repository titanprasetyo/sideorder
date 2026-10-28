// =========================================================================
// RELIABLE CAFE ORDER CHIME PLAYER (WEB AUDIO API + WAV AUDIO FALLBACK)
// =========================================================================

let sharedAudioCtx: AudioContext | null = null;
let fallbackAudioEl: HTMLAudioElement | null = null;
let isAudioUnlocked = false;
let pendingChimeQueued = false;
let globalListenersAttached = false;

/**
 * Bangkitkan file WAV (PCM 16-bit 22050Hz) di memori (Data URI)
 * berisi suara bel kasir 2 nada ("Ding-Dong!") sebagai fallback apabila
 * Web Audio API diblokir atau terkena suspend oleh browser.
 */
function buildBellWavDataUri(): string {
    const sampleRate = 22050;
    const durationSec = 1.15;
    const numSamples = Math.floor(sampleRate * durationSec);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    };

    // WAV Header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // Bits per sample
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // Sintesis gelombang bel kasir (Nada 1: E5 659.25Hz + C6, Nada 2: C5 523.25Hz + G5, lalu ulang cepat)
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        let sample = 0;

        // Ding 1 (0.00s - 0.50s): 880 Hz (A5) + 1760 Hz overtone
        if (t >= 0 && t < 0.55) {
            const env = Math.exp(-t * 6.5);
            sample +=
                (0.65 * Math.sin(2 * Math.PI * 880 * t) +
                    0.35 * Math.sin(2 * Math.PI * 1760 * t)) *
                env;
        }

        // Dong 1 (0.18s - 1.10s): 659.25 Hz (E5) + 1318.5 Hz overtone
        if (t >= 0.18) {
            const dt = t - 0.18;
            const env = Math.exp(-dt * 4.2);
            sample +=
                (0.7 * Math.sin(2 * Math.PI * 659.25 * dt) +
                    0.3 * Math.sin(2 * Math.PI * 1318.5 * dt)) *
                env;
        }

        // Clamp [-1, 1]
        const clamped = Math.max(-1, Math.min(1, sample * 0.85));
        view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return `data:audio/wav;base64,${btoa(binary)}`;
}

function getFallbackAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    try {
        if (!fallbackAudioEl) {
            fallbackAudioEl = new Audio(buildBellWavDataUri());
            fallbackAudioEl.preload = 'auto';
            fallbackAudioEl.volume = 1.0;
        }
        return fallbackAudioEl;
    } catch {
        return null;
    }
}

export function getSharedAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
        const AudioContextClass =
            window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return null;
        if (!sharedAudioCtx) {
            sharedAudioCtx = new AudioContextClass();
        }
        return sharedAudioCtx;
    } catch {
        return null;
    }
}

export function unlockAudioContext(): void {
    if (typeof window === 'undefined') return;

    try {
        const ctx = getSharedAudioContext();
        if (ctx) {
            if (ctx.state === 'suspended') {
                ctx.resume()
                    .then(() => {
                        isAudioUnlocked = true;
                        if (pendingChimeQueued) {
                            pendingChimeQueued = false;
                            playOrderChime();
                        }
                    })
                    .catch(() => {});
            } else if (ctx.state === 'running') {
                isAudioUnlocked = true;
            }
        }

        // Prime HTMLAudioElement pada saat interaksi pertama
        const audio = getFallbackAudio();
        if (audio && !isAudioUnlocked) {
            const prevVolume = audio.volume;
            audio.volume = 0;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        audio.pause();
                        audio.currentTime = 0;
                        audio.volume = prevVolume;
                        isAudioUnlocked = true;
                        if (pendingChimeQueued) {
                            pendingChimeQueued = false;
                            playOrderChime();
                        }
                    })
                    .catch(() => {
                        audio.volume = prevVolume;
                    });
            }
        }
    } catch {
        // Ignore
    }
}

function attachGlobalAudioUnlockers(): void {
    if (typeof window === 'undefined' || globalListenersAttached) return;
    globalListenersAttached = true;

    const events = ['pointerdown', 'mousedown', 'click', 'touchstart', 'keydown'];
    const onInteract = () => {
        unlockAudioContext();
    };

    events.forEach((evt) => {
        window.addEventListener(evt, onInteract, { capture: true, passive: true });
    });
}

// Pasang listener otomatis begitu modul dimuat di browser
attachGlobalAudioUnlockers();

function playWebAudioSynth(ctx: AudioContext): void {
    const now = ctx.currentTime;

    const playNote = (
        freq: number,
        startTime: number,
        duration: number,
        peakGain: number,
        type: OscillatorType = 'triangle',
    ) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.001, startTime);
        gain.gain.linearRampToValueAtTime(peakGain, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(startTime);
        osc.stop(startTime + duration);
    };

    // Ketukan Bel 1 (Ding-Dong Nyaring)
    playNote(880, now, 0.45, 0.55, 'triangle'); // A5
    playNote(1760, now, 0.35, 0.25, 'sine'); // Harmoni A6
    playNote(659.25, now + 0.17, 0.65, 0.6, 'triangle'); // E5
    playNote(1318.5, now + 0.17, 0.5, 0.25, 'sine'); // Harmoni E6

    // Ketukan Bel 2 (Pengulangan lembut agar kasir pasti dengar)
    playNote(880, now + 0.55, 0.45, 0.5, 'triangle'); // A5
    playNote(1046.5, now + 0.72, 0.75, 0.65, 'triangle'); // C6 (Nada naik segar)
    playNote(2093, now + 0.72, 0.55, 0.25, 'sine'); // Harmoni C7
}

function playHtmlAudioFallback(): void {
    try {
        const audio = getFallbackAudio();
        if (!audio) return;
        audio.volume = 1.0;
        audio.currentTime = 0;
        const p = audio.play();
        if (p !== undefined) {
            p.catch(() => {
                pendingChimeQueued = true;
            });
        }
    } catch {
        // Ignore
    }
}

/**
 * Bunyikan bel notifikasi pesanan masuk.
 * Menggunakan Web Audio API Synthesizer + Fallback HTML5 Audio WAV.
 */
export function playOrderChime(): void {
    if (typeof window === 'undefined') return;

    try {
        const ctx = getSharedAudioContext();
        if (ctx) {
            if (ctx.state === 'running') {
                playWebAudioSynth(ctx);
                return;
            }

            // Jika AudioContext masih suspended, coba resume sekaligus jalankan fallback WAV
            ctx.resume()
                .then(() => {
                    isAudioUnlocked = true;
                    playWebAudioSynth(ctx);
                })
                .catch(() => {
                    pendingChimeQueued = true;
                    playHtmlAudioFallback();
                });

            // Mainkan juga HTML5 Audio secara paralel jika state masih belum running
            playHtmlAudioFallback();
            return;
        }

        playHtmlAudioFallback();
    } catch {
        playHtmlAudioFallback();
    }
}
