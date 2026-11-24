const REALTIME_SYNC_CHANNEL = 'sideline-realtime-sync';

/**
 * Kirim sinyal pembaruan instan antar-tab di browser yang sama
 * (misalnya saat kasir atau admin mengubah status pesanan/pembayaran).
 */
export function notifyRealtimeSync(source = 'orders'): void {
    if (
        typeof window === 'undefined' ||
        typeof BroadcastChannel === 'undefined'
    ) {
        return;
    }

    try {
        const channel = new BroadcastChannel(REALTIME_SYNC_CHANNEL);
        channel.postMessage({ source, timestamp: Date.now() });
        channel.close();
    } catch {
        // Abaikan bila BroadcastChannel diblokir oleh kebijakan browser
    }
}

/**
 * Berlangganan sinyal pembaruan real-time antar-tab browser.
 */
export function subscribeRealtimeSync(onNotify: () => void): () => void {
    if (
        typeof window === 'undefined' ||
        typeof BroadcastChannel === 'undefined'
    ) {
        return () => {};
    }

    let channel: BroadcastChannel | null = null;
    try {
        channel = new BroadcastChannel(REALTIME_SYNC_CHANNEL);
        channel.onmessage = () => {
            onNotify();
        };
    } catch {
        return () => {};
    }

    return () => {
        try {
            channel?.close();
        } catch {
            // Abaikan error penutupan channel
        }
    };
}
