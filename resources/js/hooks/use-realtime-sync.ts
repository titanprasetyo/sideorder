import { router } from '@inertiajs/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { subscribeRealtimeSync } from '@/lib/realtime-sync';

interface UseRealtimeSyncOptions<T> {
    syncUrl: string;
    intervalMs?: number;
    enabled?: boolean;
    onData: (payload: T) => void;
}

export function useRealtimeSync<T>({
    syncUrl,
    intervalMs = 4000,
    enabled = true,
    onData,
}: UseRealtimeSyncOptions<T>) {
    const [isAutoSync, setIsAutoSync] = useState(enabled);
    const [isSyncing, setIsSyncing] = useState(false);

    const onDataRef = useRef(onData);
    const syncUrlRef = useRef(syncUrl);
    const isAutoSyncRef = useRef(isAutoSync);
    const activeControllerRef = useRef<AbortController | null>(null);
    const isInFlightRef = useRef(false);
    const isNavigatingRef = useRef(false);
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        onDataRef.current = onData;
    }, [onData]);

    useEffect(() => {
        syncUrlRef.current = syncUrl;
    }, [syncUrl]);

    useEffect(() => {
        isAutoSyncRef.current = isAutoSync;
    }, [isAutoSync]);

    const runSync = useCallback(async (isManual = false): Promise<boolean> => {
        if (isInFlightRef.current) {
            if (!isManual) {
                return false;
            }
            activeControllerRef.current?.abort();
        }

        if (!isManual && isNavigatingRef.current) {
            return false;
        }

        const controller = new AbortController();
        activeControllerRef.current = controller;
        isInFlightRef.current = true;
        if (isManual) {
            setIsSyncing(true);
        }

        try {
            const response = await fetch(syncUrlRef.current, {
                signal: controller.signal,
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });

            if (!response.ok || controller.signal.aborted) {
                return false;
            }

            const payload = (await response.json()) as T;
            if (controller.signal.aborted) {
                return false;
            }

            onDataRef.current(payload);
            return true;
        } catch {
            // Abaikan AbortError maupun gangguan jaringan sementara saat background sync
            return false;
        } finally {
            if (activeControllerRef.current === controller) {
                activeControllerRef.current = null;
                isInFlightRef.current = false;
            }
            if (isManual) {
                setIsSyncing(false);
            }
        }
    }, []);

    useEffect(() => {
        let cancelled = false;

        const clearTimer = () => {
            if (pollTimerRef.current !== null) {
                clearTimeout(pollTimerRef.current);
                pollTimerRef.current = null;
            }
        };

        const scheduleNext = (delay = intervalMs) => {
            clearTimer();
            if (cancelled || !isAutoSyncRef.current) {
                return;
            }

            pollTimerRef.current = setTimeout(() => {
                void tick();
            }, delay);
        };

        const tick = async () => {
            if (cancelled || !isAutoSyncRef.current) {
                return;
            }

            if (document.hidden || isNavigatingRef.current) {
                scheduleNext(intervalMs);
                return;
            }

            await runSync(false);
            if (!cancelled && isAutoSyncRef.current) {
                scheduleNext(intervalMs);
            }
        };

        const triggerImmediateSync = () => {
            if (
                cancelled ||
                !isAutoSyncRef.current ||
                document.hidden ||
                isNavigatingRef.current
            ) {
                return;
            }
            clearTimer();
            void runSync(false).finally(() => {
                if (!cancelled && isAutoSyncRef.current) {
                    scheduleNext(intervalMs);
                }
            });
        };

        const unsubStart = router.on('start', () => {
            isNavigatingRef.current = true;
            activeControllerRef.current?.abort();
        });

        const unsubFinish = router.on('finish', () => {
            isNavigatingRef.current = false;
        });

        const handleFocusOrVisible = () => {
            if (!document.hidden) {
                triggerImmediateSync();
            }
        };

        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted && !document.hidden) {
                triggerImmediateSync();
            }
        };

        window.addEventListener('focus', handleFocusOrVisible);
        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('visibilitychange', handleFocusOrVisible);
        const unsubBroadcast = subscribeRealtimeSync(() => {
            triggerImmediateSync();
        });

        if (isAutoSync) {
            scheduleNext(intervalMs);
        }

        return () => {
            cancelled = true;
            clearTimer();
            activeControllerRef.current?.abort();
            activeControllerRef.current = null;
            isInFlightRef.current = false;
            unsubStart();
            unsubFinish();
            window.removeEventListener('focus', handleFocusOrVisible);
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener(
                'visibilitychange',
                handleFocusOrVisible,
            );
            unsubBroadcast();
        };
    }, [syncUrl, isAutoSync, intervalMs, runSync]);

    const toggleAutoSync = useCallback(() => {
        setIsAutoSync((prev) => !prev);
    }, []);

    const syncNow = useCallback(async () => {
        return runSync(true);
    }, [runSync]);

    return {
        isAutoSync,
        setIsAutoSync,
        toggleAutoSync,
        isSyncing,
        syncNow,
    };
}
