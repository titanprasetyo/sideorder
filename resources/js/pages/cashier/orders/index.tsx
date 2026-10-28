import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ArrowRight,
    Banknote,
    Building2,
    Check,
    CheckCircle2,
    ChevronDown,
    Clock,
    Coffee,
    CreditCard,
    DollarSign,
    FileText,
    History,
    Home,
    Kanban,
    List,
    Loader2,
    LogOut,
    MoreVertical,
    Printer,
    QrCode,
    RefreshCw,
    Search,
    UtensilsCrossed,
    Volume2,
    VolumeX,
    X,
    XCircle,
} from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { playOrderChime, unlockAudioContext } from '@/lib/order-chime';
import type { User } from '@/types';

interface OrderOption {
    id: number;
    group_name: string;
    option_name: string;
    additional_price: string;
}

interface OrderItem {
    id: number;
    order_id: number;
    menu_id: number | null;
    menu_name: string;
    base_price: string;
    quantity: number;
    unit_price: string;
    total_price: string;
    customer_notes: string | null;
    status: 'active' | 'rejected';
    rejection_reason?: string | null;
    rejected_at?: string | null;
    rejected_by_user?: { id: number; name: string } | null;
    options: OrderOption[];
}

interface RejectedItemRecord {
    id: number;
    order_id: number;
    order_number: string;
    table_number: string;
    customer_name: string;
    menu_name: string;
    quantity: number;
    unit_price: number;
    total_price: number;
    rejection_reason: string;
    rejected_at: string | null;
    cashier_name: string;
}

interface StatusHistory {
    id: number;
    status: string;
    notes: string | null;
    created_at: string;
    user?: { id: number; name: string };
}

interface Order {
    id: number;
    order_number: string;
    customer_name: string;
    subtotal: string;
    total_amount: string;
    order_status: 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';
    payment_status: 'unpaid' | 'paid';
    payment_method: string | null;
    settled_amount?: number;
    unpaid_balance?: number;
    notes: string | null;
    created_at: string;
    updated_at?: string;
    table: {
        id: number;
        table_number: string;
        name: string | null;
    };
    items: OrderItem[];
    status_histories?: StatusHistory[];
}

interface Props {
    orders: Order[] | { data: Order[]; total?: number };
    counts: {
        pending: number;
        processing: number;
        ready: number;
        completed_today: number;
        active?: number;
        rejections?: number;
        all?: number;
    };
    stats?: {
        processing_amount?: number;
        completed_amount?: number;
        ready_tables?: string[];
        active_tables_count?: number;
        rejected_items_count?: number;
    };
    rejections?: RejectedItemRecord[];
    dateFilter?: string;
}

export default function CashierOrdersIndex({
    orders,
    counts,
    stats,
    rejections = [],
    dateFilter = 'today',
}: Props) {
    const { auth } = usePage<{ auth: { user: User } }>().props;
    const staffName = auth?.user?.name ?? 'Zaynnn';
    const isAdmin = auth?.user?.role === 'admin';

    // Normalisasi array data pesanan dari server
    const serverOrdersList = useMemo(() => {
        return Array.isArray(orders) ? orders : (orders?.data ?? []);
    }, [orders]);

    // Local state pesanan
    const [localOrders, setLocalOrders] = useState<Order[]>(serverOrdersList);
    const [liveCounts, setLiveCounts] = useState(counts);
    const [liveStats, setLiveStats] = useState(stats);
    const [localRejections, setLocalRejections] = useState<RejectedItemRecord[]>(rejections);

    // View State: 'queue' (Tampilan Antrean Tabel sesuai gambar), 'kanban' (Kartu KDS), 'history', 'rejections'
    const [currentView, setCurrentView] = useState<'queue' | 'kanban' | 'history' | 'rejections'>('queue');
    const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'processing' | 'ready' | 'completed'>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'table'>('newest');
    const [searchQuery, setSearchQuery] = useState('');

    // State Pelacak Panggilan Waiter per Order ID
    const [calledWaiterOrderIds, setCalledWaiterOrderIds] = useState<Record<number, boolean>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem('sideline_waiter_calls');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('sideline_waiter_calls', JSON.stringify(calledWaiterOrderIds));
        } catch {}
    }, [calledWaiterOrderIds]);

    // Checklist Item state
    const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem('sideline_cashier_item_checks');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    useEffect(() => {
        try {
            localStorage.setItem('sideline_cashier_item_checks', JSON.stringify(checkedItems));
        } catch {}
    }, [checkedItems]);

    // State Pelacak Tombol Loading per Order ID
    const [processingOrderIds, setProcessingOrderIds] = useState<Record<number, boolean>>({});

    // Kontrol Real-Time Sync & Audio
    const [isAutoSync, setIsAutoSync] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [latencyMs, setLatencyMs] = useState(95);
    const [soundEnabled, setSoundEnabled] = useState(() => {
        return typeof window !== 'undefined'
            ? localStorage.getItem('sideline_cashier_sound') !== 'disabled'
            : true;
    });

    // Real-Time Clock
    const [currentTimeString, setCurrentTimeString] = useState('08:41 WIB');
    const [currentDateString, setCurrentDateString] = useState('Sel, 27 Okt 2026');

    useEffect(() => {
        document.body.classList.add('theme-sideline');
        return () => {
            document.body.classList.remove('theme-sideline');
        };
    }, []);

    useEffect(() => {
        const updateClock = () => {
            const now = new Date();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            setCurrentTimeString(`${hours}:${minutes} WIB`);
            setCurrentDateString(
                now.toLocaleDateString('id-ID', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                })
            );
        };
        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, []);

    // Refs untuk mencegah tabrakan polling dengan aksi kasir
    const isActionInFlightRef = useRef(false);
    const activeMutationsCountRef = useRef(0);
    const inFlightByOrderRef = useRef<Record<number, number>>({});
    const lastMutationFinishedAtRef = useRef(0);
    const pollAbortControllerRef = useRef<AbortController | null>(null);
    const orderActionQueueRef = useRef<Record<number, Promise<void>>>({});
    const optimisticLocksRef = useRef<
        Map<
            number,
            {
                patch: Partial<Order>;
                expiresAt: number;
            }
        >
    >(new Map());
    const knownOrderIdsRef = useRef<Set<number>>(new Set(serverOrdersList.map((o) => o.id)));
    const soundEnabledRef = useRef<boolean>(soundEnabled);
    const searchInputRef = useRef<HTMLInputElement>(null);

    const STAGE_RANK: Record<Order['order_status'], number> = {
        pending: 1,
        processing: 2,
        ready: 3,
        completed: 4,
        cancelled: 5,
    };

    const abortActiveSync = () => {
        if (pollAbortControllerRef.current) {
            try {
                pollAbortControllerRef.current.abort();
            } catch {}
            pollAbortControllerRef.current = null;
        }
    };

    const setOptimisticOrderLock = (orderId: number, patch: Partial<Order>, ttlMs = 15000) => {
        const existing = optimisticLocksRef.current.get(orderId)?.patch ?? {};
        optimisticLocksRef.current.set(orderId, {
            patch: { ...existing, ...patch },
            expiresAt: Date.now() + ttlMs,
        });
    };

    useEffect(() => {
        soundEnabledRef.current = soundEnabled;
    }, [soundEnabled]);

    const updateStateFromIncoming = (data: {
        orders?: Order[] | { data: Order[] };
        counts?: Props['counts'];
        stats?: Props['stats'];
        rejections?: RejectedItemRecord[];
    }) => {
        if (!data) return;
        const incomingList: Order[] = Array.isArray(data.orders)
            ? data.orders
            : data.orders?.data ?? [];

        const newIncoming = incomingList.filter(
            (o) =>
                !knownOrderIdsRef.current.has(o.id) &&
                (o.order_status === 'pending' || o.order_status === 'processing')
        );

        if (newIncoming.length > 0) {
            if (soundEnabledRef.current) {
                playOrderChime();
            }
            newIncoming.forEach((o) => {
                toast.success(`🔔 Pesanan Baru Masuk! Meja ${o.table?.table_number ?? '00'}`, {
                    description: `${o.customer_name} • Total: ${formatRupiah(o.total_amount)}`,
                    duration: 7000,
                });
            });
        }

        incomingList.forEach((o) => knownOrderIdsRef.current.add(o.id));

        setLocalOrders((prevLocalOrders) => {
            const localOrdersMap = new Map(prevLocalOrders.map((o) => [o.id, o]));

            const merged = incomingList.map((serverOrder) => {
                const localOrder = localOrdersMap.get(serverOrder.id);
                const lockEntry = optimisticLocksRef.current.get(serverOrder.id);
                const patch = lockEntry ? lockEntry.patch : null;
                const orderInFlight = (inFlightByOrderRef.current[serverOrder.id] ?? 0) > 0;

                let effectiveStatus = serverOrder.order_status;
                if (serverOrder.order_status !== 'cancelled') {
                    if (patch?.order_status) {
                        const patchRank = STAGE_RANK[patch.order_status] ?? 0;
                        const currentRank = STAGE_RANK[effectiveStatus] ?? 0;
                        if (patchRank > currentRank) {
                            effectiveStatus = patch.order_status;
                        }
                    }
                    if (localOrder?.order_status && localOrder.order_status !== 'cancelled') {
                        const localRank = STAGE_RANK[localOrder.order_status] ?? 0;
                        const currentRank = STAGE_RANK[effectiveStatus] ?? 0;
                        if (localRank > currentRank) {
                            effectiveStatus = localOrder.order_status;
                        }
                    }
                }

                let effectivePayment = serverOrder.payment_status;
                if (
                    patch?.payment_status === 'paid' ||
                    localOrder?.payment_status === 'paid'
                ) {
                    effectivePayment = 'paid';
                }

                if (
                    lockEntry &&
                    !orderInFlight &&
                    (!patch?.order_status ||
                        STAGE_RANK[serverOrder.order_status] >= STAGE_RANK[patch.order_status]) &&
                    (!patch?.payment_status ||
                        serverOrder.payment_status === patch.payment_status)
                ) {
                    optimisticLocksRef.current.delete(serverOrder.id);
                }

                return {
                    ...serverOrder,
                    ...(patch ?? {}),
                    order_status: effectiveStatus,
                    payment_status: effectivePayment,
                };
            });

            return merged;
        });

        if (data.counts) setLiveCounts(data.counts);
        if (data.stats) setLiveStats(data.stats);
        if (data.rejections) setLocalRejections(data.rejections);
    };

    const isInitialMountRef = useRef(true);

    useEffect(() => {
        if (isInitialMountRef.current) {
            isInitialMountRef.current = false;
            return;
        }
        if (activeMutationsCountRef.current > 0) return;
        updateStateFromIncoming({
            orders: serverOrdersList,
            counts,
            stats,
            rejections,
        });
    }, [dateFilter]);

    useEffect(() => {
        const handleUnlock = () => {
            unlockAudioContext();
        };

        window.addEventListener('pointerdown', handleUnlock, { passive: true });
        window.addEventListener('click', handleUnlock, { passive: true });
        window.addEventListener('keydown', handleUnlock, { passive: true });
        window.addEventListener('touchstart', handleUnlock, { passive: true });
        return () => {
            window.removeEventListener('pointerdown', handleUnlock);
            window.removeEventListener('click', handleUnlock);
            window.removeEventListener('keydown', handleUnlock);
            window.removeEventListener('touchstart', handleUnlock);
        };
    }, []);

    // REAL-TIME POLLING
    useEffect(() => {
        let isCancelled = false;
        let pollTimer: ReturnType<typeof setTimeout> | null = null;

        const executePoll = async () => {
            if (
                !isAutoSync ||
                isActionInFlightRef.current ||
                activeMutationsCountRef.current > 0 ||
                Date.now() - lastMutationFinishedAtRef.current < 1200 ||
                isCancelled
            ) {
                if (!isCancelled) pollTimer = setTimeout(executePoll, 2000);
                return;
            }

            const controller = new AbortController();
            pollAbortControllerRef.current = controller;

            try {
                const startTime = performance.now();
                setIsSyncing(true);

                const response = await fetch(`/cashier/orders/sync?date=${dateFilter}`, {
                    signal: controller.signal,
                    credentials: 'same-origin',
                    headers: {
                        Accept: 'application/json',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                });

                if (!response.ok) throw new Error('Sync failed');
                const data = await response.json();

                if (
                    isCancelled ||
                    controller.signal.aborted ||
                    isActionInFlightRef.current ||
                    activeMutationsCountRef.current > 0 ||
                    Date.now() - lastMutationFinishedAtRef.current < 1200
                ) {
                    return;
                }

                const elapsed = Math.round(performance.now() - startTime);
                setLatencyMs(Math.max(12, Math.min(elapsed, 95)));

                updateStateFromIncoming(data);
            } catch {
                // Ignore transient network hiccups
            } finally {
                if (pollAbortControllerRef.current === controller) {
                    pollAbortControllerRef.current = null;
                }
                if (!isCancelled) {
                    setIsSyncing(false);
                    if (isAutoSync) {
                        pollTimer = setTimeout(executePoll, 2000);
                    }
                }
            }
        };

        pollTimer = setTimeout(executePoll, 1500);

        return () => {
            isCancelled = true;
            abortActiveSync();
            if (pollTimer) clearTimeout(pollTimer);
        };
    }, [isAutoSync, dateFilter]);

    const syncNow = async (showToast = true) => {
        abortActiveSync();
        try {
            setIsSyncing(true);
            const res = await fetch(`/cashier/orders/sync?date=${dateFilter}`, {
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            if (!res.ok) throw new Error('Sinkronisasi gagal.');
            const data = await res.json();
            updateStateFromIncoming(data);
            if (showToast) toast.success('Data pesanan diperbarui');
        } catch (err: any) {
            if (showToast) toast.error(err?.message || 'Gagal sinkron data.');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleManualSync = () => {
        void syncNow(true);
    };

    const toggleSound = () => {
        const next = !soundEnabled;
        setSoundEnabled(next);
        try {
            localStorage.setItem('sideline_cashier_sound', next ? 'enabled' : 'disabled');
        } catch {}

        if (next) {
            playOrderChime();
            toast.success('Bel Notifikasi Aktif (Tes Suara)');
        } else {
            toast.info('Bel notifikasi dinonaktifkan');
        }
    };

    const formatRupiah = (amount: number | string) => {
        const num = typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
        return `Rp ${num.toLocaleString('id-ID')}`;
    };

    const formatTimeOnly = (isoString?: string | null) => {
        if (!isoString) return '--:--';
        try {
            const d = new Date(isoString);
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        } catch {
            return '--:--';
        }
    };

    const getRelativeMinutes = (isoString?: string | null) => {
        if (!isoString) return '0 menit lalu';
        try {
            const diffMs = Date.now() - new Date(isoString).getTime();
            const minutes = Math.max(0, Math.floor(diffMs / 60000));
            return `${minutes} menit lalu`;
        } catch {
            return '0 menit lalu';
        }
    };

    const formatDateTime = (isoString?: string | null) => {
        if (!isoString) return '-';
        try {
            const d = new Date(isoString);
            return d.toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
            });
        } catch {
            return isoString;
        }
    };

    // State Checkbox Konfirmasi Pesanan Done Diterima
    const [acceptedOrders, setAcceptedOrders] = useState<Record<number, boolean>>(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem('sideline_cashier_accepted_orders');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    const handleToggleOrderAccepted = (order: Order) => {
        const isCurrentlyAccepted = !!acceptedOrders[order.id];
        const nextVal = !isCurrentlyAccepted;

        setAcceptedOrders((prev) => {
            const next = { ...prev, [order.id]: nextVal };
            try {
                localStorage.setItem('sideline_cashier_accepted_orders', JSON.stringify(next));
            } catch {}
            return next;
        });

        if (nextVal) {
            if (soundEnabled) playOrderChime();
            toast.success(`✅ Meja ${order.table?.table_number ?? '00'}: Pesanan diterima!`);
        } else {
            toast.info(`Meja ${order.table?.table_number ?? '00'}: Tanda terima dibatalkan.`);
        }
    };

    // Modal Pembayaran
    const [selectedOrderForPayment, setSelectedOrderForPayment] = useState<Order | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'qris' | 'transfer' | 'debit'>('cash');
    const [cashReceived, setCashReceived] = useState<string>('');

    // Modal Batal Pesan (Sederhana & Bersih)
    const [selectedOrderForCancel, setSelectedOrderForCancel] = useState<Order | null>(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    // Modal Cetak Struk (Memuat rincian item lengkap)
    const [selectedOrderForReceipt, setSelectedOrderForReceipt] = useState<Order | null>(null);
    const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

    // Modal Keluar Shift
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

    const buildCsrfHeaders = (): Record<string, string> => {
        const headers: Record<string, string> = {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
        };

        if (typeof document !== 'undefined') {
            const metaToken = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content');
            if (metaToken) {
                headers['X-CSRF-TOKEN'] = metaToken;
            }

            const xsrfMatch = document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/);
            if (xsrfMatch?.[1]) {
                try {
                    headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[1]);
                } catch {}
            }
        }

        return headers;
    };

    const enqueueOrderMutation = (orderId: number, task: () => Promise<void>) => {
        abortActiveSync();
        activeMutationsCountRef.current += 1;
        inFlightByOrderRef.current[orderId] = (inFlightByOrderRef.current[orderId] ?? 0) + 1;
        isActionInFlightRef.current = true;

        const previousPromise = orderActionQueueRef.current[orderId] ?? Promise.resolve();
        const nextPromise = previousPromise
            .catch(() => {})
            .then(async () => {
                try {
                    await task();
                } finally {
                    inFlightByOrderRef.current[orderId] = Math.max(
                        0,
                        (inFlightByOrderRef.current[orderId] ?? 1) - 1
                    );
                    activeMutationsCountRef.current = Math.max(
                        0,
                        activeMutationsCountRef.current - 1
                    );
                    lastMutationFinishedAtRef.current = Date.now();
                    if (activeMutationsCountRef.current === 0) {
                        isActionInFlightRef.current = false;
                    }
                    if (inFlightByOrderRef.current[orderId] === 0) {
                        setProcessingOrderIds((prev) => {
                            if (!prev[orderId]) return prev;
                            const copy = { ...prev };
                            delete copy[orderId];
                            return copy;
                        });
                    }
                }
            });

        orderActionQueueRef.current[orderId] = nextPromise;
        return nextPromise;
    };

    // UPDATE STATUS OPERASIONAL
    const handleUpdateStatus = (
        order: Order,
        newStatus: 'processing' | 'ready' | 'completed' | 'cancelled',
        note?: string
    ) => {
        if (order.order_status === 'completed') {
            toast.info(`Pesanan #${order.order_number} sudah selesai.`);
            return;
        }
        if (order.order_status === 'cancelled') {
            toast.info(`Pesanan #${order.order_number} sudah dibatalkan.`);
            return;
        }

        if (newStatus === 'completed' && order.payment_status !== 'paid') {
            toast.error('Pesanan belum lunas! Harap konfirmasi pembayaran terlebih dahulu.');
            openPaymentModal(order);
            return;
        }

        const oldStatus = order.order_status;
        const targetOrderId = order.id;
        const targetOrderNumber = order.order_number;

        setOptimisticOrderLock(targetOrderId, { order_status: newStatus });

        setLocalOrders((prev) =>
            prev.map((o) => (o.id === targetOrderId ? { ...o, order_status: newStatus } : o))
        );

        const statusLabels: Record<string, string> = {
            processing: 'Sedang Diracik Barista',
            ready: 'Siap Disajikan di Meja',
            completed: 'Pesanan Selesai',
            cancelled: 'Dibatalkan',
        };

        toast.success(
            `Meja ${order.table?.table_number ?? '00'}: ${statusLabels[newStatus] || newStatus}!`
        );

        void enqueueOrderMutation(targetOrderId, async () => {
            try {
                const res = await fetch(
                    `/cashier/orders/${targetOrderId}/update-status?date=${dateFilter}`,
                    {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: buildCsrfHeaders(),
                        body: JSON.stringify({
                            status: newStatus,
                            notes: note || null,
                            date: dateFilter,
                        }),
                    }
                );

                const data = await res.json().catch(() => null);

                if (!res.ok || data?.success === false) {
                    const errMsg = data?.message || 'Gagal mengubah status pesanan.';
                    throw new Error(errMsg);
                }

                if ((inFlightByOrderRef.current[targetOrderId] ?? 0) <= 1 && data?.orders) {
                    updateStateFromIncoming(data);
                }
            } catch (err: any) {
                optimisticLocksRef.current.delete(targetOrderId);
                setLocalOrders((prev) =>
                    prev.map((o) =>
                        o.id === targetOrderId ? { ...o, order_status: oldStatus } : o
                    )
                );
                toast.error(err?.message || 'Gagal mengubah status pesanan.');
                void syncNow(false);
            }
        });
    };

    // Panggil Waiter
    const handleCallWaiter = (order: Order) => {
        setCalledWaiterOrderIds((prev) => ({ ...prev, [order.id]: true }));
        if (soundEnabled) playOrderChime();
        toast.success(`🔔 Waiter dipanggil ke Meja ${order.table?.table_number ?? '00'}!`);
    };

    const handleCallWaiterAll = () => {
        const readyOrders = localOrders.filter((o) => o.order_status === 'ready');
        if (readyOrders.length === 0) {
            toast.info('Tidak ada pesanan siap saji saat ini.');
            return;
        }
        const updates: Record<number, boolean> = {};
        readyOrders.forEach((o) => {
            updates[o.id] = true;
        });
        setCalledWaiterOrderIds((prev) => ({ ...prev, ...updates }));
        if (soundEnabled) playOrderChime();
        toast.success(`🔔 Panggilan dikirim untuk ${readyOrders.length} pesanan siap saji!`);
    };

    // KONFIRMASI PEMBAYARAN
    const getOrderAmountDue = (order: Order): number => {
        if (typeof order.unpaid_balance === 'number') {
            return Math.max(0, order.unpaid_balance);
        }
        const total = parseFloat(order.total_amount) || 0;
        const settled = Number(order.settled_amount ?? 0);
        return Math.max(0, total - settled);
    };

    const openPaymentModal = (order: Order) => {
        setSelectedOrderForPayment(order);
        setPaymentMethod('cash');
        setCashReceived('');
        setIsPaymentModalOpen(true);
    };

    // ALUR KASIR: CEKLIS DITERIMA -> KLIK KONFIRMASI -> PEMBAYARAN -> STRUK & TERUSKAN KE RACIK
    const handleKonfirmasiClick = (order: Order) => {
        if (order.order_status === 'pending') {
            // Pastikan checkbox diterima tercentang
            setAcceptedOrders((prev) => {
                const next = { ...prev, [order.id]: true };
                try {
                    localStorage.setItem('sideline_cashier_accepted_orders', JSON.stringify(next));
                } catch {}
                return next;
            });

            // Masuk langsung ke modal Pembayaran jika belum lunas
            if (order.payment_status !== 'paid') {
                openPaymentModal(order);
            } else {
                // Jika sudah lunas, langsung teruskan ke racik barista dan buka struk
                handleUpdateStatus(order, 'processing');
                openReceiptModal(order);
            }
        } else if (order.order_status === 'processing') {
            handleUpdateStatus(order, 'ready');
        } else if (order.order_status === 'ready') {
            // Selesaikan pesanan ke status 'completed'
            if (order.payment_status !== 'paid') {
                toast.error('Pesanan belum lunas! Harap konfirmasi pembayaran terlebih dahulu.');
                openPaymentModal(order);
            } else {
                handleUpdateStatus(order, 'completed');
            }
        } else if (order.order_status === 'completed') {
            openReceiptModal(order);
        }
    };

    const handleConfirmPaymentSubmit = () => {
        if (!selectedOrderForPayment) return;
        const order = selectedOrderForPayment;
        const amountDue = getOrderAmountDue(order);

        if (paymentMethod === 'cash') {
            const receivedNum = parseFloat(cashReceived);
            if (isNaN(receivedNum) || receivedNum < amountDue) {
                toast.error(
                    `Uang tunai kurang! Minimal bayar: ${formatRupiah(amountDue)}`
                );
                return;
            }
        }

        const orderId = order.id;
        const orderNumber = order.order_number;
        // Alur otomatis: setelah bayar, pesanan diteruskan ke racik barista ('processing')
        const newStatusAfterPay = order.order_status === 'pending' ? 'processing' : order.order_status;

        // Pastikan checkbox diterima tercentang
        setAcceptedOrders((prev) => {
            const next = { ...prev, [orderId]: true };
            try {
                localStorage.setItem('sideline_cashier_accepted_orders', JSON.stringify(next));
            } catch {}
            return next;
        });

        setOptimisticOrderLock(orderId, {
            payment_status: 'paid',
            order_status: newStatusAfterPay,
        });

        const updatedOrder: Order = {
            ...order,
            payment_status: 'paid',
            order_status: newStatusAfterPay,
            payment_method: paymentMethod,
        };

        setLocalOrders((prev) =>
            prev.map((o) => (o.id === orderId ? updatedOrder : o))
        );

        // Tutup modal bayar
        setIsPaymentModalOpen(false);

        // Buka otomatis modal Cetak Struk dan beri info teruskan ke racik
        setSelectedOrderForReceipt(updatedOrder);
        setIsReceiptModalOpen(true);
        if (soundEnabled) playOrderChime();

        toast.success(`✅ Pembayaran #${orderNumber} Lunas! Pesanan diteruskan ke racik barista.`);

        void enqueueOrderMutation(orderId, async () => {
            try {
                const res = await fetch(
                    `/cashier/orders/${orderId}/confirm-payment?date=${dateFilter}`,
                    {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: buildCsrfHeaders(),
                        body: JSON.stringify({
                            payment_method: paymentMethod,
                            cash_received: paymentMethod === 'cash' ? parseFloat(cashReceived) : amountDue,
                            change_amount:
                                paymentMethod === 'cash'
                                    ? Math.max(0, parseFloat(cashReceived) - amountDue)
                                    : 0,
                            date: dateFilter,
                        }),
                    }
                );

                const data = await res.json().catch(() => null);
                if (!res.ok || data?.success === false) {
                    throw new Error(data?.message || 'Gagal memproses pembayaran.');
                }

                if ((inFlightByOrderRef.current[orderId] ?? 0) <= 1 && data?.orders) {
                    updateStateFromIncoming(data);
                }
            } catch (err: any) {
                optimisticLocksRef.current.delete(orderId);
                toast.error(err?.message || 'Gagal memproses pembayaran.');
                void syncNow(false);
            }
        });
    };

    // BATALKAN PESANAN
    const openCancelModal = (order: Order) => {
        setSelectedOrderForCancel(order);
        setCancelReason('');
        setIsCancelModalOpen(true);
    };

    const handleCancelOrderSubmit = () => {
        if (!selectedOrderForCancel) return;
        const order = selectedOrderForCancel;
        const reason = cancelReason.trim() || 'Dibatalkan oleh kasir';

        setIsCancelModalOpen(false);
        handleUpdateStatus(order, 'cancelled', reason);
    };

    // STRUK KAFE
    const openReceiptModal = (order: Order) => {
        setSelectedOrderForReceipt(order);
        setIsReceiptModalOpen(true);
    };

    const printLastReceipt = () => {
        const lastOrder =
            localOrders.find((o) => o.order_status === 'completed') ||
            localOrders.find((o) => o.payment_status === 'paid') ||
            localOrders[0];

        if (lastOrder) {
            openReceiptModal(lastOrder);
        } else {
            toast.info('Belum ada pesanan untuk dicetak struknya.');
        }
    };

    const toggleItemCheck = (itemId: number) => {
        setCheckedItems((prev) => ({
            ...prev,
            [itemId]: !prev[itemId],
        }));
    };

    // HITUNG COUNTS & STATS
    const countsLive = useMemo(() => {
        const pending = localOrders.filter((o) => o.order_status === 'pending');
        const processing = localOrders.filter((o) => o.order_status === 'processing');
        const ready = localOrders.filter((o) => o.order_status === 'ready');
        const completed = localOrders.filter((o) => o.order_status === 'completed');

        return {
            pending: pending.length,
            processing: processing.length,
            ready: ready.length,
            completed_today: liveCounts?.completed_today ?? completed.length,
            all: localOrders.length,
            rejections: localRejections.length,
        };
    }, [localOrders, liveCounts, localRejections]);

    const statsProcessingAmount = useMemo(() => {
        if (liveStats?.processing_amount !== undefined) {
            return liveStats.processing_amount;
        }
        return localOrders
            .filter((o) => o.order_status === 'processing')
            .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    }, [localOrders, liveStats]);

    const statsCompletedAmount = useMemo(() => {
        if (liveStats?.completed_amount !== undefined) {
            return liveStats.completed_amount;
        }
        return localOrders
            .filter((o) => o.order_status === 'completed')
            .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    }, [localOrders, liveStats]);

    const readyTablesList = useMemo(() => {
        const ready = localOrders.filter((o) => o.order_status === 'ready');
        if (ready.length === 0) return 'Tidak ada antrian';
        const tables = Array.from(new Set(ready.map((o) => `Meja ${o.table?.table_number ?? '00'}`)));
        return tables.slice(0, 3).join(', ') + (tables.length > 3 ? '...' : '');
    }, [localOrders]);

    // FILTER & SORT PESANAN UNTUK TABEL ANTREAN
    const filteredAndSortedOrders = useMemo(() => {
        let list = [...localOrders];

        // Filter tab
        if (activeTab === 'pending') {
            list = list.filter((o) => o.order_status === 'pending');
        } else if (activeTab === 'processing') {
            list = list.filter((o) => o.order_status === 'processing');
        } else if (activeTab === 'ready') {
            list = list.filter((o) => o.order_status === 'ready');
        } else if (activeTab === 'completed') {
            list = list.filter((o) => o.order_status === 'completed');
        }

        // Search query
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter((o) => {
                const matchTable = (o.table?.table_number ?? '').toLowerCase().includes(q);
                const matchCustomer = (o.customer_name ?? '').toLowerCase().includes(q);
                const matchOrderNum = (o.order_number ?? '').toLowerCase().includes(q);
                const matchItem = o.items.some((it) => it.menu_name.toLowerCase().includes(q));
                return matchTable || matchCustomer || matchOrderNum || matchItem;
            });
        }

        // Sort
        list.sort((a, b) => {
            if (sortBy === 'newest') {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            } else if (sortBy === 'oldest') {
                return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            } else if (sortBy === 'table') {
                const numA = parseInt(a.table?.table_number || '0', 10);
                const numB = parseInt(b.table?.table_number || '0', 10);
                return numA - numB;
            }
            return 0;
        });

        return list;
    }, [localOrders, activeTab, searchQuery, sortBy]);

    // Shortcut Keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isTyping =
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.isContentEditable;

            if (e.key === '/' && !isTyping) {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    return (
        <>
            <Head title="Kasir Meja Depan • SIDE LINE Cafe" />

            <div className="flex h-screen w-screen overflow-hidden bg-[#FAF7F0] font-sans text-neutral-900 select-none">
                {/* ========================================================================= */}
                {/* 1. SIDEBAR KASIR (Warm Cream Elegant Theme) */}
                {/* ========================================================================= */}
                <aside className="w-64 flex-shrink-0 bg-[#FBF8F2] border-r border-[#EFE8DD] flex flex-col justify-between p-4 z-20">
                    <div className="space-y-6">
                        {/* Cafe Brand Header */}
                        <div className="flex items-center gap-3 px-1 pt-1">
                            <div className="size-10 rounded-full bg-[#C82A2A] text-white flex items-center justify-center font-black text-sm shadow-xs tracking-tighter">
                                SL
                            </div>
                            <div>
                                <h1 className="text-sm font-black tracking-tight text-neutral-900 leading-tight">
                                    SIDE LINE
                                </h1>
                                <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-widest">
                                    COFFEE & EATERY
                                </p>
                            </div>
                        </div>

                        {/* Navigation Menu */}
                        <nav className="space-y-1.5">
                            {/* 1. Kasir Aktif (Transaksi & Pesanan) */}
                            <button
                                type="button"
                                onClick={() => setCurrentView('queue')}
                                className={`w-full text-left p-3 rounded-2xl flex items-center justify-between transition-all ${
                                    currentView === 'queue' || currentView === 'kanban'
                                        ? 'bg-[#EFE7D8] text-neutral-900 shadow-2xs'
                                        : 'text-neutral-700 hover:bg-[#F3ECE0]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-1 rounded-lg">
                                        <Home className="size-4 text-neutral-800" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-neutral-900 leading-tight">
                                            Kasir Aktif
                                        </div>
                                        <div className="text-[10px] text-neutral-500 font-medium">
                                            Transaksi & Pesanan
                                        </div>
                                    </div>
                                </div>
                                <span className="size-2 rounded-full bg-emerald-500 mr-1" />
                            </button>

                            {/* 2. Riwayat Selesai */}
                            <button
                                type="button"
                                onClick={() => setCurrentView('history')}
                                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all text-left ${
                                    currentView === 'history'
                                        ? 'bg-[#EFE7D8] text-neutral-900 shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#F3ECE0]'
                                }`}
                            >
                                <div className="flex items-center gap-3">
                                    <Clock className="size-4 text-neutral-600" />
                                    <span>Riwayat Selesai</span>
                                </div>
                                <span className="bg-[#EAE2D3] text-neutral-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {countsLive.completed_today}
                                </span>
                            </button>

                            {/* Admin back link */}
                            {isAdmin && (
                                <Link
                                    href="/admin/orders"
                                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold text-[#C82A2A] hover:bg-[#F3ECE0] transition-all text-left mt-2"
                                >
                                    <ArrowRight className="size-4 rotate-180 text-[#C82A2A]" />
                                    <span>Panel Administrator</span>
                                </Link>
                            )}
                        </nav>
                    </div>

                    {/* Bottom Profile & Logout Shift */}
                    <div className="space-y-3 pt-4 border-t border-[#EFE8DD]">
                        <div className="flex items-center gap-3 px-1">
                            <div className="size-9 rounded-full bg-[#E5D7B7] text-neutral-800 flex items-center justify-center font-bold text-xs flex-shrink-0">
                                {staffName.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-bold text-neutral-900 truncate">
                                    {staffName}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-500">
                                    <span className="size-1.5 rounded-full bg-emerald-500" />
                                    <span>{isAdmin ? 'Administrator' : 'Kasir Aktif'}</span>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsLogoutModalOpen(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-white hover:bg-neutral-50 border border-neutral-200/80 rounded-xl text-xs font-semibold text-neutral-800 shadow-2xs transition-all"
                        >
                            <LogOut className="size-3.5 text-neutral-600" />
                            <span>Keluar Shift / Logout</span>
                        </button>
                    </div>
                </aside>

                {/* ========================================================================= */}
                {/* 2. MAIN CONTENT AREA */}
                {/* ========================================================================= */}
                <main className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
                    {/* TOP HEADER BAR */}
                    <header className="h-16 flex-shrink-0 px-6 flex items-center justify-between gap-4 border-b border-[#EFE8DD]/70 bg-[#FAF7F0]">
                        {/* Title & Real-Time Status */}
                        <div>
                            <h2 className="text-base font-bold text-neutral-900 tracking-tight leading-tight">
                                SIDE LINE Cafe – Kasir Meja Depan
                            </h2>
                            <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-0.5 font-medium">
                                <span>
                                    Area Meja ({liveStats?.active_tables_count ?? 4} Meja Aktif)
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 font-semibold text-neutral-800">
                                    <span className="size-1.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
                                    <span className="text-[#C82A2A]">Real-Time Kasir Aktif ({latencyMs}ms)</span>
                                </span>
                            </div>
                        </div>

                        {/* Search Input Bar */}
                        <div className="relative w-80 lg:w-96">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-neutral-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari No. Meja / Order ID / Menu..."
                                className="w-full h-9 pl-9 pr-9 bg-white border border-[#E8DFC8] rounded-full text-xs text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:border-neutral-500 shadow-2xs transition-colors"
                            />
                            {searchQuery ? (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                                >
                                    <X className="size-3.5" />
                                </button>
                            ) : (
                                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 font-mono">
                                    /
                                </kbd>
                            )}
                        </div>

                        {/* Right Controls: Clock, Sound Bell, Print Button */}
                        <div className="flex items-center gap-3">
                            {/* Live Clock Card */}
                            <div className="flex items-center gap-2 px-3 py-1 bg-white border border-[#E8DFC8] rounded-xl text-neutral-800 shadow-2xs">
                                <Clock className="size-3.5 text-amber-600" />
                                <div className="text-right">
                                    <div className="text-xs font-bold text-neutral-900 leading-tight">
                                        {currentTimeString}
                                    </div>
                                    <div className="text-[10px] text-neutral-500">
                                        {currentDateString}
                                    </div>
                                </div>
                            </div>

                            {/* Bell Notifikasi Button */}
                            <button
                                type="button"
                                onClick={toggleSound}
                                className={`h-9 px-3 rounded-full border text-xs font-semibold flex items-center gap-1.5 transition-all shadow-2xs ${
                                    soundEnabled
                                        ? 'border-emerald-400/80 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100'
                                        : 'border-neutral-300 bg-white text-neutral-400 hover:bg-neutral-50'
                                }`}
                                title="Klik untuk uji suara bel notifikasi / aktifkan bel"
                            >
                                {soundEnabled ? (
                                    <>
                                        <Volume2 className="size-3.5 text-emerald-700" />
                                        <span>Bel Aktif (Tes Suara)</span>
                                    </>
                                ) : (
                                    <>
                                        <VolumeX className="size-3.5 text-neutral-400" />
                                        <span>Bel Senyap</span>
                                    </>
                                )}
                            </button>

                            {/* Cetak Struk Terakhir Button */}
                            <button
                                type="button"
                                onClick={printLastReceipt}
                                className="h-9 px-3.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-800 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs transition-all"
                            >
                                <Printer className="size-3.5 text-neutral-700" />
                                <span>Cetak Struk Terakhir</span>
                            </button>
                        </div>
                    </header>

                    {/* TOP 4 SUMMARY STATS CARDS */}
                    <div className="px-6 pt-3 pb-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 flex-shrink-0">
                        {/* 1. Pesanan Baru Masuk */}
                        <div className="bg-white border border-[#EFE7D8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="size-7 rounded-lg bg-red-50 text-[#C82A2A] flex items-center justify-center">
                                        <FileText className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Pesanan Baru Masuk
                                    </span>
                                </div>
                                <span className="bg-[#C82A2A] text-white text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase">
                                    PERLU KONFIRMASI
                                </span>
                            </div>
                            <div className="mt-3 flex items-baseline justify-between">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-3xl font-black text-neutral-900">
                                        {countsLive.pending}
                                    </span>
                                    <span className="text-xs font-medium text-neutral-500">
                                        Pesanan Meja
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 text-xs font-medium text-neutral-500">
                                    <CheckCircle2 className="size-3.5 text-neutral-400" />
                                    <span>{countsLive.pending > 0 ? 'Perlu tindakan' : 'Tertangani'}</span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Sedang Diracik Barista */}
                        <div className="bg-white border border-[#EFE7D8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="size-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                                        <Coffee className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Sedang Diracik Barista
                                    </span>
                                </div>
                                <span className="bg-amber-100/70 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {countsLive.processing} +
                                </span>
                            </div>
                            <div className="mt-3 flex items-baseline justify-between">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-3xl font-black text-neutral-900">
                                        {countsLive.processing}
                                    </span>
                                    <span className="text-xs font-medium text-neutral-500">
                                        Tiket Aktif
                                    </span>
                                </div>
                                <div className="text-xs font-bold text-neutral-900">
                                    {formatRupiah(statsProcessingAmount)}
                                </div>
                            </div>
                        </div>

                        {/* 3. Siap Saji ke Meja */}
                        <div className="bg-white border border-[#EFE7D8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="size-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                        <UtensilsCrossed className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Siap Saji ke Meja
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCallWaiterAll}
                                    className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold px-2 py-0.5 rounded-full hover:bg-emerald-100 transition-colors"
                                >
                                    Panggil Waiter
                                </button>
                            </div>
                            <div className="mt-3 flex items-baseline justify-between">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-3xl font-black text-neutral-900">
                                        {countsLive.ready}
                                    </span>
                                    <span className="text-xs font-medium text-neutral-500">
                                        Siap Diantar
                                    </span>
                                </div>
                                <div className="text-xs font-medium text-neutral-500">
                                    {readyTablesList}
                                </div>
                            </div>
                        </div>

                        {/* 4. Selesai Hari Ini */}
                        <div className="bg-white border border-[#EFE7D8] rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="size-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                                        <CheckCircle2 className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Selesai Hari Ini
                                    </span>
                                </div>
                                <span className="bg-neutral-100 text-neutral-600 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                    Hari Ini
                                </span>
                            </div>
                            <div className="mt-3 flex items-baseline justify-between">
                                <div className="flex items-baseline gap-1.5">
                                    <span className="text-3xl font-black text-neutral-900">
                                        {countsLive.completed_today}
                                    </span>
                                    <span className="text-xs font-medium text-neutral-500">
                                        Pesanan
                                    </span>
                                </div>
                                <div className="text-xs font-bold text-[#C82A2A]">
                                    {formatRupiah(statsCompletedAmount)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* VIEW: QUEUE TABLE (Default View Sesuai Gambar) */}
                    {(currentView === 'queue' || currentView === 'kanban') && (
                        <div className="flex-1 flex flex-col min-h-0 px-6 pb-4 pt-1">
                            {/* FILTER TABS & SORT ROW */}
                            <div className="flex items-center justify-between py-2 flex-shrink-0">
                                {/* Left Filter Tabs */}
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                                    {/* 1. Semua */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('all')}
                                        className={`px-4 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                                            activeTab === 'all'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                                        }`}
                                    >
                                        <span>Semua</span>
                                        <span
                                            className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                                                activeTab === 'all'
                                                    ? 'bg-white/25 text-white'
                                                    : 'bg-neutral-100 text-neutral-600'
                                            }`}
                                        >
                                            {countsLive.all}
                                        </span>
                                    </button>

                                    {/* 2. Pesanan Baru */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('pending')}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                                            activeTab === 'pending'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                                        }`}
                                    >
                                        <Coffee className="size-3.5" />
                                        <span>Pesanan Baru</span>
                                        <span className="size-4.5 rounded-full bg-[#C82A2A] text-white text-[10px] font-bold flex items-center justify-center">
                                            {countsLive.pending}
                                        </span>
                                    </button>

                                    {/* 3. Sedang Diracik */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('processing')}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                                            activeTab === 'processing'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                                        }`}
                                    >
                                        <Coffee className="size-3.5" />
                                        <span>Sedang Diracik</span>
                                        <span className="size-4.5 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center">
                                            {countsLive.processing}
                                        </span>
                                    </button>

                                    {/* 4. Siap Disajikan */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('ready')}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                                            activeTab === 'ready'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                                        }`}
                                    >
                                        <UtensilsCrossed className="size-3.5" />
                                        <span>Siap Disajikan</span>
                                        <span className="size-4.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                                            {countsLive.ready}
                                        </span>
                                    </button>

                                    {/* 5. Selesai */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('completed')}
                                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                                            activeTab === 'completed'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                                        }`}
                                    >
                                        <CheckCircle2 className="size-3.5" />
                                        <span>Selesai</span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-neutral-200 text-neutral-700">
                                            {countsLive.completed_today}
                                        </span>
                                    </button>
                                </div>

                                {/* Right Sort & View Toggles */}
                                <div className="flex items-center gap-2">
                                    {/* Sort Dropdown */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-medium text-neutral-700 hover:bg-neutral-50 flex items-center gap-1.5 shadow-2xs"
                                            >
                                                <span>
                                                    {sortBy === 'newest'
                                                        ? 'Urutkan Terbaru'
                                                        : sortBy === 'oldest'
                                                        ? 'Urutkan Terlama'
                                                        : 'Urutkan Meja'}
                                                </span>
                                                <ChevronDown className="size-3.5 text-neutral-400" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="bg-white border-neutral-200 text-xs">
                                            <DropdownMenuItem onClick={() => setSortBy('newest')}>
                                                Urutkan Terbaru (Default)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setSortBy('oldest')}>
                                                Urutkan Terlama (FIFO)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={() => setSortBy('table')}>
                                                Urutkan Nomor Meja
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    {/* View Toggle (Table vs Kanban) */}
                                    <div className="flex items-center bg-white border border-neutral-200 rounded-lg p-0.5 shadow-2xs">
                                        <button
                                            type="button"
                                            onClick={() => setCurrentView('queue')}
                                            title="Tampilan Antrean Tabel (Sesuai Gambar)"
                                            className={`p-1.5 rounded-md ${
                                                currentView === 'queue'
                                                    ? 'bg-neutral-100 text-neutral-900 font-bold'
                                                    : 'text-neutral-400 hover:text-neutral-700'
                                            }`}
                                        >
                                            <List className="size-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentView('kanban')}
                                            title="Tampilan Kartu Kanban (KDS Barista)"
                                            className={`p-1.5 rounded-md ${
                                                currentView === 'kanban'
                                                    ? 'bg-neutral-100 text-neutral-900 font-bold'
                                                    : 'text-neutral-400 hover:text-neutral-700'
                                            }`}
                                        >
                                            <Kanban className="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* MAIN TABLE CONTAINER (Sesuai Gambar) */}
                            {currentView === 'queue' && (
                                <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#EFE7D8] shadow-xs overflow-hidden flex flex-col">
                                    <div className="flex-1 overflow-y-auto">
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 bg-white sticky top-0 z-10">
                                                    <th className="py-3 px-4 w-14 font-medium">No.</th>
                                                    <th className="py-3 px-4 w-28 font-medium">Meja</th>
                                                    <th className="py-3 px-4 w-32 font-medium">Waktu</th>
                                                    <th className="py-3 px-4 font-medium">Menu</th>
                                                    <th className="py-3 px-4 w-20 text-center font-medium">Jumlah</th>
                                                    <th className="py-3 px-4 w-32 font-medium">Total</th>
                                                    <th className="py-3 px-4 w-36 font-medium">Status</th>
                                                    <th className="py-3 px-4 w-52 text-right font-medium">Aksi</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-100 text-xs">
                                                {filteredAndSortedOrders.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="py-16 text-center text-neutral-400">
                                                            <div className="flex flex-col items-center justify-center">
                                                                <FileText className="size-9 text-neutral-300 mb-2" />
                                                                <p className="text-xs font-semibold text-neutral-600">
                                                                    Tidak ada antrian pesanan
                                                                </p>
                                                                <p className="text-[11px] text-neutral-400 mt-0.5">
                                                                    {searchQuery
                                                                        ? `Tidak ditemukan hasil untuk "${searchQuery}"`
                                                                        : 'Pesanan baru dari tamu kafe akan otomatis tampil di sini'}
                                                                </p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredAndSortedOrders.map((order, index) => {
                                                        const isPending = order.order_status === 'pending';
                                                        const isProcessing = order.order_status === 'processing';
                                                        const isReady = order.order_status === 'ready';
                                                        const isWaiterCalled = !!calledWaiterOrderIds[order.id];
                                                        const isCompleted = order.order_status === 'completed';
                                                        const isOrderAccepted = !!acceptedOrders[order.id] || order.order_status !== 'pending';

                                                        // Indikator garis vertikal di sebelah kiri
                                                        let stripeColor = 'border-l-neutral-300';
                                                        if (isPending) stripeColor = 'border-l-[#C82A2A]';
                                                        else if (isProcessing) stripeColor = 'border-l-amber-400';
                                                        else if (isReady && !isWaiterCalled) stripeColor = 'border-l-emerald-500';
                                                        else if (isReady && isWaiterCalled) stripeColor = 'border-l-blue-500';
                                                        else if (isCompleted) stripeColor = 'border-l-neutral-300';

                                                        const activeItems = order.items.filter(
                                                            (it) => it.status !== 'rejected'
                                                        );
                                                        const totalQty = activeItems.reduce(
                                                            (sum, it) => sum + it.quantity,
                                                            0
                                                        );

                                                        // Tentukan icon makanan atau minuman
                                                        const hasFood = activeItems.some((it) => {
                                                            const name = it.menu_name.toLowerCase();
                                                            return (
                                                                name.includes('nasi') ||
                                                                name.includes('mie') ||
                                                                name.includes('roti') ||
                                                                name.includes('toast') ||
                                                                name.includes('sandwich') ||
                                                                name.includes('croissant') ||
                                                                name.includes('snack') ||
                                                                name.includes('goreng')
                                                            );
                                                        });

                                                        return (
                                                            <tr
                                                                key={order.id}
                                                                className={`hover:bg-neutral-50/70 transition-colors border-l-[3.5px] ${stripeColor}`}
                                                            >
                                                                {/* 1. No. */}
                                                                <td className="py-3 px-4 font-bold text-neutral-800">
                                                                    {String(index + 1).padStart(2, '0')}
                                                                </td>

                                                                {/* 2. Meja */}
                                                                <td className="py-3 px-4">
                                                                    <div className="font-bold text-neutral-900">
                                                                        Meja {order.table?.table_number ?? '00'}
                                                                    </div>
                                                                    <div className="text-[10px] text-neutral-400 truncate max-w-[100px]">
                                                                        {order.customer_name}
                                                                    </div>
                                                                </td>

                                                                {/* 3. Waktu */}
                                                                <td className="py-3 px-4">
                                                                    <div className="font-semibold text-neutral-800">
                                                                        {formatTimeOnly(order.created_at)}
                                                                    </div>
                                                                    <div className="text-[11px] text-neutral-400">
                                                                        {getRelativeMinutes(order.created_at)}
                                                                    </div>
                                                                </td>

                                                                {/* 4. Menu */}
                                                                <td className="py-3 px-4">
                                                                    <div className="flex items-start gap-2.5">
                                                                        {hasFood ? (
                                                                            <UtensilsCrossed className="size-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                                                                        ) : (
                                                                            <Coffee className="size-4 text-neutral-400 mt-0.5 flex-shrink-0" />
                                                                        )}
                                                                        <div className="space-y-0.5">
                                                                            {activeItems.map((item) => (
                                                                                <div
                                                                                    key={item.id}
                                                                                    className="text-xs text-neutral-800 leading-snug"
                                                                                >
                                                                                    <span className="font-semibold">
                                                                                        {item.quantity}x
                                                                                    </span>{' '}
                                                                                    <span>{item.menu_name}</span>
                                                                                    {item.options && item.options.length > 0 && (
                                                                                        <span className="text-[10px] text-neutral-500 ml-1">
                                                                                            ({item.options.map((o) => o.option_name).join(', ')})
                                                                                        </span>
                                                                                    )}
                                                                                    {item.customer_notes && (
                                                                                        <span className="block text-[10px] text-amber-700 italic">
                                                                                            "{item.customer_notes}"
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </td>

                                                                {/* 5. Jumlah */}
                                                                <td className="py-3 px-4 text-center font-medium text-neutral-600">
                                                                    {totalQty}
                                                                </td>

                                                                {/* 6. Total */}
                                                                <td className="py-3 px-4 font-bold text-neutral-900">
                                                                    {formatRupiah(order.total_amount)}
                                                                </td>

                                                                {/* 7. Status Badge */}
                                                                <td className="py-3 px-4">
                                                                    {isPending && (
                                                                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#FFF1F1] text-[#E02424] border border-[#FCD9BD]/50 inline-block">
                                                                            Baru
                                                                        </span>
                                                                    )}
                                                                    {isProcessing && (
                                                                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#FEF7EC] text-[#D97706] border border-[#FDE68A]/60 inline-block">
                                                                            Sedang Diracik
                                                                        </span>
                                                                    )}
                                                                    {isReady && !isWaiterCalled && (
                                                                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#ECFDF5] text-[#059669] border border-[#A7F3D0]/60 inline-block">
                                                                            Siap Disajikan
                                                                        </span>
                                                                    )}
                                                                    {isReady && isWaiterCalled && (
                                                                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]/60 inline-block">
                                                                            Diantar
                                                                        </span>
                                                                    )}
                                                                    {isCompleted && (
                                                                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200 inline-block">
                                                                            Selesai
                                                                        </span>
                                                                    )}
                                                                    {order.order_status === 'cancelled' && (
                                                                        <span className="px-3 py-1 rounded-full text-[11px] font-semibold bg-red-100 text-red-800 border border-red-200 inline-block">
                                                                            Batal
                                                                        </span>
                                                                    )}
                                                                </td>

                                                                {/* 8. Aksi */}
                                                                <td className="py-3 px-4 text-right">
                                                                    <div className="flex items-center justify-end gap-2.5">
                                                                        {/* CHECKBOX KONFIRMASI: Pesanan Done Diterima */}
                                                                        <label
                                                                            title="Ceklis jika pesanan done diterima"
                                                                            className="flex items-center gap-1.5 cursor-pointer select-none group/check"
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isOrderAccepted}
                                                                                onChange={() => handleToggleOrderAccepted(order)}
                                                                                className="size-4.5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer accent-emerald-600 transition-all"
                                                                            />
                                                                            <span
                                                                                className={`text-[11px] font-semibold transition-colors ${
                                                                                    isOrderAccepted
                                                                                        ? 'text-emerald-700 font-bold'
                                                                                        : 'text-neutral-400 group-hover/check:text-neutral-700'
                                                                                }`}
                                                                            >
                                                                                {isOrderAccepted ? 'Diterima' : 'Terima'}
                                                                            </span>
                                                                        </label>

                                                                        {/* TOMBOL KONFIRMASI: Ceklis -> Konfirmasi -> Pembayaran -> Struk & Teruskan ke Racik */}
                                                                        <Button
                                                                            type="button"
                                                                            onClick={() => handleKonfirmasiClick(order)}
                                                                            className={`rounded-full text-xs font-bold px-4 py-1.5 h-auto shadow-xs transition-all flex items-center gap-1.5 ${
                                                                                isPending
                                                                                    ? 'bg-[#C82A2A] hover:bg-[#A92222] text-white'
                                                                                    : isProcessing
                                                                                    ? 'bg-[#E89E28] hover:bg-[#D48D1D] text-white'
                                                                                    : isReady
                                                                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                                                                    : 'border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700'
                                                                            }`}
                                                                        >
                                                                            <span>
                                                                                {isPending
                                                                                    ? 'Konfirmasi'
                                                                                    : isProcessing
                                                                                    ? 'Tandai Siap Saji'
                                                                                    : isReady
                                                                                    ? 'Selesaikan Pesanan'
                                                                                    : 'Cetak Struk'}
                                                                            </span>
                                                                        </Button>

                                                                        {/* Dropdown Options (⋮): Sederhana & Bersih */}
                                                                        <DropdownMenu>
                                                                            <DropdownMenuTrigger asChild>
                                                                                <button
                                                                                    type="button"
                                                                                    title="Menu Opsi"
                                                                                    className="p-1.5 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
                                                                                >
                                                                                    <MoreVertical className="size-4" />
                                                                                </button>
                                                                            </DropdownMenuTrigger>
                                                                            <DropdownMenuContent
                                                                                align="end"
                                                                                className="bg-white border-neutral-200 text-xs min-w-40 shadow-md"
                                                                            >
                                                                                {order.payment_status !== 'paid' && (
                                                                                    <DropdownMenuItem
                                                                                        onClick={() => openPaymentModal(order)}
                                                                                        className="flex items-center gap-2 font-semibold text-emerald-700 cursor-pointer"
                                                                                    >
                                                                                        <DollarSign className="size-3.5 text-emerald-600" />
                                                                                        <span>Bayar Kasir</span>
                                                                                    </DropdownMenuItem>
                                                                                )}

                                                                                {isReady && (
                                                                                    <DropdownMenuItem
                                                                                        onClick={() => handleCallWaiter(order)}
                                                                                        className="flex items-center gap-2 cursor-pointer font-medium text-blue-600"
                                                                                    >
                                                                                        <UtensilsCrossed className="size-3.5 text-blue-500" />
                                                                                        <span>Panggil Waiter (Bel)</span>
                                                                                    </DropdownMenuItem>
                                                                                )}

                                                                                <DropdownMenuItem
                                                                                    onClick={() => openReceiptModal(order)}
                                                                                    className="flex items-center gap-2 cursor-pointer font-medium"
                                                                                >
                                                                                    <Printer className="size-3.5 text-neutral-600" />
                                                                                    <span>Cetak Struk Kafe</span>
                                                                                </DropdownMenuItem>

                                                                                <DropdownMenuSeparator />

                                                                                <DropdownMenuItem
                                                                                    onClick={() => openCancelModal(order)}
                                                                                    className="flex items-center gap-2 text-red-600 cursor-pointer font-medium"
                                                                                >
                                                                                    <XCircle className="size-3.5 text-red-500" />
                                                                                    <span>Batalkan Pesanan</span>
                                                                                </DropdownMenuItem>
                                                                            </DropdownMenuContent>
                                                                        </DropdownMenu>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* KANBAN BOARD VIEW (Opsi Tambahan untuk Barista) */}
                            {currentView === 'kanban' && (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0">
                                    {/* Column 1: Pesanan Baru */}
                                    <div className="bg-[#FAF5E8] border border-[#E8DFC8] rounded-2xl flex flex-col h-full min-h-0 p-3 shadow-xs">
                                        <div className="flex items-center justify-between pb-3 px-1 flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="size-2.5 rounded-full bg-[#C82A2A]" />
                                                <h3 className="text-sm font-bold text-neutral-900">
                                                    Pesanan Baru
                                                </h3>
                                                <span className="size-5 rounded-full bg-[#C82A2A] text-white text-[10px] font-bold flex items-center justify-center">
                                                    {countsLive.pending}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                            {localOrders
                                                .filter((o) => o.order_status === 'pending')
                                                .map((o) => (
                                                    <div
                                                        key={o.id}
                                                        className="bg-white border border-[#E2D5BA] rounded-xl p-3 shadow-xs space-y-2"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-black text-neutral-900">
                                                                Meja {o.table?.table_number ?? '00'}
                                                            </span>
                                                            <span className="text-[10px] text-neutral-400">
                                                                #{o.order_number}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-neutral-700">
                                                            {o.items
                                                                .filter((it) => it.status !== 'rejected')
                                                                .map((it) => (
                                                                    <div key={it.id}>
                                                                        {it.quantity}x {it.menu_name}
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleKonfirmasiClick(o)}
                                                            className="w-full bg-[#C82A2A] hover:bg-[#A92222] text-white text-xs font-bold rounded-lg py-1.5"
                                                        >
                                                            Konfirmasi Pesanan
                                                        </Button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Column 2: Sedang Diracik */}
                                    <div className="bg-[#FAF5E8] border border-[#E8DFC8] rounded-2xl flex flex-col h-full min-h-0 p-3 shadow-xs">
                                        <div className="flex items-center justify-between pb-3 px-1 flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="size-2.5 rounded-full bg-amber-400" />
                                                <h3 className="text-sm font-bold text-neutral-900">
                                                    Sedang Diracik Barista
                                                </h3>
                                                <span className="size-5 rounded-full bg-amber-500 text-white text-[10px] font-bold flex items-center justify-center">
                                                    {countsLive.processing}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                            {localOrders
                                                .filter((o) => o.order_status === 'processing')
                                                .map((o) => (
                                                    <div
                                                        key={o.id}
                                                        className="bg-white border border-[#E2D5BA] rounded-xl p-3 shadow-xs space-y-2"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-black text-neutral-900">
                                                                Meja {o.table?.table_number ?? '00'}
                                                            </span>
                                                            <span className="text-xs font-bold text-neutral-800">
                                                                {formatRupiah(o.total_amount)}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-neutral-700 space-y-1">
                                                            {o.items
                                                                .filter((it) => it.status !== 'rejected')
                                                                .map((it) => (
                                                                    <div
                                                                        key={it.id}
                                                                        onClick={() => toggleItemCheck(it.id)}
                                                                        className="flex items-center gap-2 cursor-pointer"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={!!checkedItems[it.id]}
                                                                            readOnly
                                                                            className="rounded"
                                                                        />
                                                                        <span
                                                                            className={
                                                                                checkedItems[it.id]
                                                                                    ? 'line-through text-neutral-400'
                                                                                    : ''
                                                                            }
                                                                        >
                                                                            {it.quantity}x {it.menu_name}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleUpdateStatus(o, 'ready')}
                                                            className="w-full bg-[#E89E28] hover:bg-[#D48D1D] text-white text-xs font-bold rounded-lg py-1.5"
                                                        >
                                                            Tandai Siap Saji
                                                        </Button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Column 3: Siap Disajikan */}
                                    <div className="bg-[#FAF5E8] border border-[#E8DFC8] rounded-2xl flex flex-col h-full min-h-0 p-3 shadow-xs">
                                        <div className="flex items-center justify-between pb-3 px-1 flex-shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="size-2.5 rounded-full bg-emerald-500" />
                                                <h3 className="text-sm font-bold text-neutral-900">
                                                    Siap Saji ke Meja
                                                </h3>
                                                <span className="size-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center">
                                                    {countsLive.ready}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                                            {localOrders
                                                .filter((o) => o.order_status === 'ready')
                                                .map((o) => (
                                                    <div
                                                        key={o.id}
                                                        className="bg-white border-2 border-emerald-500 rounded-xl p-3 shadow-xs space-y-2"
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-black text-neutral-900">
                                                                Meja {o.table?.table_number ?? '00'}
                                                            </span>
                                                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                                Siap Diantar
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-neutral-700">
                                                            {o.items
                                                                .filter((it) => it.status !== 'rejected')
                                                                .map((it) => (
                                                                    <div key={it.id}>
                                                                        {it.quantity}x {it.menu_name}
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleCallWaiter(o)}
                                                                className="flex-1 border-emerald-400 text-emerald-700 text-xs font-semibold py-1.5"
                                                            >
                                                                Panggil Waiter
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (o.payment_status !== 'paid') {
                                                                        openPaymentModal(o);
                                                                    } else {
                                                                        handleUpdateStatus(o, 'completed');
                                                                    }
                                                                }}
                                                                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-1.5"
                                                            >
                                                                Selesai
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* VIEW: RIWAYAT PESANAN SELESAI */}
                    {currentView === 'history' && (
                        <div className="flex-1 flex flex-col min-h-0 px-6 pb-4 pt-2">
                            <div className="flex items-center justify-between py-2">
                                <h3 className="text-sm font-bold text-neutral-900">
                                    Riwayat Pesanan Selesai ({countsLive.completed_today} Pesanan)
                                </h3>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentView('queue')}
                                    className="text-xs font-semibold"
                                >
                                    Kembali ke Antrean Aktif
                                </Button>
                            </div>
                            <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#EFE7D8] shadow-xs overflow-hidden flex flex-col">
                                <div className="flex-1 overflow-y-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 bg-white sticky top-0 z-10">
                                                <th className="py-3 px-4">Order ID</th>
                                                <th className="py-3 px-4">Meja / Tamu</th>
                                                <th className="py-3 px-4">Menu Dipesan</th>
                                                <th className="py-3 px-4">Total</th>
                                                <th className="py-3 px-4">Metode Bayar</th>
                                                <th className="py-3 px-4">Waktu Selesai</th>
                                                <th className="py-3 px-4 text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100 text-xs">
                                            {localOrders
                                                .filter((o) => o.order_status === 'completed')
                                                .map((o) => (
                                                    <tr key={o.id} className="hover:bg-neutral-50/70">
                                                        <td className="py-3 px-4 font-mono font-bold text-neutral-900">
                                                            #{o.order_number}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-neutral-900">
                                                                Meja {o.table?.table_number ?? '00'}
                                                            </div>
                                                            <div className="text-[11px] text-neutral-500">
                                                                {o.customer_name}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="space-y-0.5">
                                                                {o.items
                                                                    .filter((it) => it.status !== 'rejected')
                                                                    .map((it) => (
                                                                        <div key={it.id}>
                                                                            {it.quantity}x {it.menu_name}
                                                                        </div>
                                                                    ))}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 font-bold text-neutral-900">
                                                            {formatRupiah(o.total_amount)}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className="uppercase text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                                                                {o.payment_method ?? 'TUNAI'} (LUNAS)
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-neutral-500 text-[11px]">
                                                            {formatDateTime(o.updated_at ?? o.created_at)}
                                                        </td>
                                                        <td className="py-3 px-4 text-right">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => openReceiptModal(o)}
                                                                className="text-xs flex items-center gap-1.5"
                                                            >
                                                                <Printer className="size-3.5" />
                                                                <span>Cetak Struk</span>
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* VIEW: HISTORY PENOLAKAN MENU */}
                    {currentView === 'rejections' && (
                        <div className="flex-1 flex flex-col min-h-0 px-6 pb-4 pt-2">
                            <div className="flex items-center justify-between py-2">
                                <h3 className="text-sm font-bold text-neutral-900">
                                    History Penolakan Menu ({localRejections.length} Item)
                                </h3>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentView('queue')}
                                    className="text-xs font-semibold"
                                >
                                    Kembali ke Antrean Aktif
                                </Button>
                            </div>
                            <div className="flex-1 min-h-0 bg-white rounded-2xl border border-[#EFE7D8] shadow-xs overflow-hidden flex flex-col">
                                <div className="flex-1 overflow-y-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-neutral-100 text-[11px] font-semibold text-neutral-400 bg-white sticky top-0 z-10">
                                                <th className="py-3 px-4">Order ID</th>
                                                <th className="py-3 px-4">Meja / Tamu</th>
                                                <th className="py-3 px-4">Menu Ditolak</th>
                                                <th className="py-3 px-4">Qty</th>
                                                <th className="py-3 px-4">Total</th>
                                                <th className="py-3 px-4">Alasan Penolakan</th>
                                                <th className="py-3 px-4">Staf Kasir</th>
                                                <th className="py-3 px-4">Waktu</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100 text-xs">
                                            {localRejections.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} className="py-12 text-center text-neutral-400">
                                                        Belum ada menu yang ditolak
                                                    </td>
                                                </tr>
                                            ) : (
                                                localRejections.map((item) => (
                                                    <tr key={item.id} className="hover:bg-neutral-50/70">
                                                        <td className="py-3 px-4 font-mono font-bold text-neutral-900">
                                                            #{item.order_number}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <div className="font-bold text-neutral-900">
                                                                Meja {item.table_number}
                                                            </div>
                                                            <div className="text-[11px] text-neutral-500">
                                                                {item.customer_name}
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4 font-semibold text-neutral-900">
                                                            {item.menu_name}
                                                        </td>
                                                        <td className="py-3 px-4 font-bold">{item.quantity}x</td>
                                                        <td className="py-3 px-4 font-bold text-neutral-900">
                                                            {formatRupiah(item.total_price)}
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <span className="bg-rose-50 text-rose-700 border border-rose-200 px-2.5 py-0.5 rounded-full text-[10px] font-semibold">
                                                                {item.rejection_reason}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-neutral-700">
                                                            {item.cashier_name}
                                                        </td>
                                                        <td className="py-3 px-4 text-neutral-500 text-[11px]">
                                                            {formatDateTime(item.rejected_at)}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                </main>
            </div>



            {/* ========================================================================= */}
            {/* MODAL 1: KONFIRMASI PEMBAYARAN KASIR (ICON METODE BAYAR JELAS & RAPI) */}
            {/* ========================================================================= */}
            <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
                <DialogContent className="max-w-md bg-white border-[#EFE7D8] text-neutral-900 p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-neutral-900">
                            <span className="size-2.5 rounded-full bg-[#C82A2A]" />
                            <span>Pembayaran #{selectedOrderForPayment?.order_number}</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-500">
                            Meja <strong className="text-neutral-800">{selectedOrderForPayment?.table.table_number ?? '00'}</strong> • Tamu:{' '}
                            <strong className="text-neutral-800">{selectedOrderForPayment?.customer_name}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    {selectedOrderForPayment && (
                        <div className="space-y-4 py-2">
                            {/* Rincian Tagihan */}
                            <div className="bg-[#FAF7F0] border border-[#EFE7D8] rounded-2xl p-4 flex items-center justify-between shadow-2xs">
                                <div>
                                    <div className="text-[11px] font-semibold text-neutral-500">Total Tagihan:</div>
                                    <div className="text-xs text-neutral-400">
                                        {selectedOrderForPayment.items.filter((i) => i.status !== 'rejected').length} menu pesanan
                                    </div>
                                </div>
                                <div className="text-xl font-black text-[#C82A2A]">
                                    {formatRupiah(getOrderAmountDue(selectedOrderForPayment))}
                                </div>
                            </div>

                            {/* Pilihan Metode Bayar Berbentuk Icon Jelas & Rapi */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-neutral-700">
                                    Pilih Metode Pembayaran:
                                </Label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    {[
                                        {
                                            id: 'cash' as const,
                                            label: 'Tunai',
                                            sub: 'Cash',
                                            icon: Banknote,
                                            iconColor: 'text-emerald-600',
                                            bgColor: 'bg-emerald-50',
                                            activeBorder: 'border-emerald-600 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-600/20',
                                        },
                                        {
                                            id: 'qris' as const,
                                            label: 'QRIS',
                                            sub: 'Scan QR',
                                            icon: QrCode,
                                            iconColor: 'text-blue-600',
                                            bgColor: 'bg-blue-50',
                                            activeBorder: 'border-blue-600 bg-blue-50/70 text-blue-950 ring-2 ring-blue-600/20',
                                        },
                                        {
                                            id: 'transfer' as const,
                                            label: 'Transfer',
                                            sub: 'Bank',
                                            icon: Building2,
                                            iconColor: 'text-purple-600',
                                            bgColor: 'bg-purple-50',
                                            activeBorder: 'border-purple-600 bg-purple-50/70 text-purple-950 ring-2 ring-purple-600/20',
                                        },
                                        {
                                            id: 'debit' as const,
                                            label: 'Debit',
                                            sub: 'Kartu',
                                            icon: CreditCard,
                                            iconColor: 'text-amber-600',
                                            bgColor: 'bg-amber-50',
                                            activeBorder: 'border-amber-600 bg-amber-50/70 text-amber-950 ring-2 ring-amber-600/20',
                                        },
                                    ].map((m) => {
                                        const Icon = m.icon;
                                        const isSelected = paymentMethod === m.id;
                                        return (
                                            <button
                                                key={m.id}
                                                type="button"
                                                onClick={() => setPaymentMethod(m.id)}
                                                className={`flex flex-col items-center justify-center p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                                                    isSelected
                                                        ? `${m.activeBorder} shadow-xs scale-[1.02]`
                                                        : 'border-neutral-200 bg-white hover:bg-neutral-50 text-neutral-700'
                                                }`}
                                            >
                                                <div className={`size-10 rounded-xl ${m.bgColor} ${m.iconColor} flex items-center justify-center mb-1.5 shadow-2xs`}>
                                                    <Icon className="size-5" />
                                                </div>
                                                <span className="text-xs font-bold leading-tight">{m.label}</span>
                                                <span className="text-[10px] text-neutral-400 font-medium">{m.sub}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Input Tunai jika Cash */}
                            {paymentMethod === 'cash' && (
                                <div className="space-y-2.5 bg-[#FAF7F0] p-3.5 rounded-2xl border border-[#EFE7D8]">
                                    <div className="flex justify-between items-center">
                                        <Label className="text-xs font-bold text-neutral-800">
                                            Uang Tunai Diterima:
                                        </Label>
                                        <div className="flex gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => setCashReceived(String(getOrderAmountDue(selectedOrderForPayment)))}
                                                className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 transition-colors"
                                            >
                                                Uang Pas
                                            </button>
                                            {getOrderAmountDue(selectedOrderForPayment) <= 50000 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCashReceived('50000')}
                                                    className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 transition-colors"
                                                >
                                                    50rb
                                                </button>
                                            )}
                                            {getOrderAmountDue(selectedOrderForPayment) <= 100000 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCashReceived('100000')}
                                                    className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 transition-colors"
                                                >
                                                    100rb
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-neutral-400">
                                            Rp
                                        </span>
                                        <Input
                                            type="number"
                                            placeholder={getOrderAmountDue(selectedOrderForPayment).toLocaleString('id-ID')}
                                            value={cashReceived}
                                            onChange={(e) => setCashReceived(e.target.value)}
                                            className="pl-9 bg-white border-neutral-200 text-sm font-black text-neutral-900"
                                        />
                                    </div>

                                    {cashReceived && (
                                        <div className="flex justify-between items-center text-xs pt-1 font-bold">
                                            <span className="text-neutral-600">Kembalian:</span>
                                            <span
                                                className={
                                                    parseFloat(cashReceived) >= getOrderAmountDue(selectedOrderForPayment)
                                                        ? 'text-emerald-700 text-sm font-black'
                                                        : 'text-rose-600 font-bold'
                                                }
                                            >
                                                {parseFloat(cashReceived) >= getOrderAmountDue(selectedOrderForPayment)
                                                    ? formatRupiah(parseFloat(cashReceived) - getOrderAmountDue(selectedOrderForPayment))
                                                    : `Kurang ${formatRupiah(getOrderAmountDue(selectedOrderForPayment) - parseFloat(cashReceived))}`}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setIsPaymentModalOpen(false)}
                            className="bg-white border-neutral-200 text-xs font-semibold"
                        >
                            Batal
                        </Button>
                        <Button
                            onClick={handleConfirmPaymentSubmit}
                            className="bg-[#C82A2A] hover:bg-[#A92222] text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                        >
                            <CheckCircle2 className="size-4" />
                            <span>Konfirmasi Bayar & Buka Struk</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 2: BATALKAN PESANAN (SEDERHANA & BERSIH TANPA TOLAK MENU) */}
            {/* ========================================================================= */}
            <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
                <DialogContent className="max-w-md bg-white border-[#EFE7D8] text-neutral-900 p-6">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#C82A2A]">
                            <XCircle className="size-5" />
                            Batalkan Pesanan #{selectedOrderForCancel?.order_number}?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-500">
                            Meja {selectedOrderForCancel?.table.table_number ?? '00'} • Tamu:{' '}
                            <strong className="text-neutral-800">{selectedOrderForCancel?.customer_name}</strong>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <Label className="text-xs font-bold text-neutral-700">Alasan Pembatalan:</Label>
                        <Input
                            placeholder="Contoh: Tamu membatalkan / Stok biji kopi habis"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="bg-white border-neutral-200 text-xs"
                        />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {['Pelanggan Membatalkan', 'Stok Bahan Habis', 'Salah Input Meja', 'Pesanan Duplikat'].map(
                                (reason) => (
                                    <button
                                        key={reason}
                                        type="button"
                                        onClick={() => setCancelReason(reason)}
                                        className="text-[11px] bg-neutral-100 hover:bg-neutral-200 border border-neutral-200 px-2.5 py-1 rounded-lg font-medium text-neutral-700 transition-colors"
                                    >
                                        {reason}
                                    </button>
                                )
                            )}
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setIsCancelModalOpen(false)}
                            className="bg-white border-neutral-200 text-xs"
                        >
                            Tutup
                        </Button>
                        <Button
                            onClick={handleCancelOrderSubmit}
                            className="bg-[#C82A2A] hover:bg-red-800 text-white font-bold text-xs"
                        >
                            Ya, Batalkan Pesanan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 3: CETAK STRUK THERMAL KAFE (MEMUAT RINCIAN ITEM LENGKAP) */}
            {/* ========================================================================= */}
            <Dialog open={isReceiptModalOpen} onOpenChange={setIsReceiptModalOpen}>
                <DialogContent className="max-w-xs bg-white text-neutral-900 font-mono text-xs p-5 border-[#EFE7D8] shadow-lg">
                    <DialogHeader className="text-center space-y-1">
                        <div className="size-10 rounded-full bg-[#C82A2A] text-white flex items-center justify-center font-black text-sm mx-auto shadow-xs">
                            SL
                        </div>
                        <DialogTitle className="text-center font-black text-base text-neutral-900">
                            SIDE LINE CAFE
                        </DialogTitle>
                        <DialogDescription className="text-center text-[10px] text-neutral-500 font-sans uppercase tracking-widest">
                            Coffee & Eatery • Struk Resmi
                        </DialogDescription>
                    </DialogHeader>

                    {selectedOrderForReceipt && (
                        <div className="space-y-2.5 py-2 border-t border-b border-dashed border-neutral-300 my-1">
                            <div className="text-[11px] space-y-1">
                                <div className="flex justify-between font-bold">
                                    <span>No: #{selectedOrderForReceipt.order_number}</span>
                                    <span className="bg-neutral-100 px-2 py-0.5 rounded text-[10px]">
                                        MEJA {selectedOrderForReceipt.table?.table_number ?? '00'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-neutral-500 text-[10px]">
                                    <span>Tamu: {selectedOrderForReceipt.customer_name}</span>
                                    <span>{formatTimeOnly(selectedOrderForReceipt.created_at)} WIB</span>
                                </div>
                                <div className="flex justify-between text-neutral-500 text-[10px]">
                                    <span>Kasir: {staffName}</span>
                                    <span>
                                        {selectedOrderForReceipt.order_status === 'processing'
                                            ? 'Diracik Barista'
                                            : selectedOrderForReceipt.order_status === 'ready'
                                            ? 'Siap Disajikan'
                                            : 'Selesai'}
                                    </span>
                                </div>
                            </div>

                            <div className="border-t border-dashed border-neutral-300 my-2" />

                            {/* Detail Item Menu */}
                            <div className="space-y-2">
                                <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider font-sans">
                                    Rincian Pesanan:
                                </div>
                                {selectedOrderForReceipt.items
                                    .filter((it) => it.status !== 'rejected')
                                    .map((item) => (
                                        <div key={item.id} className="space-y-0.5">
                                            <div className="flex justify-between font-semibold">
                                                <span>
                                                    {item.quantity}x {item.menu_name}
                                                </span>
                                                <span>{formatRupiah(item.total_price)}</span>
                                            </div>
                                            {item.options && item.options.length > 0 && (
                                                <div className="text-[10px] text-neutral-500 pl-3">
                                                    + {item.options.map((opt) => opt.option_name).join(', ')}
                                                </div>
                                            )}
                                            {item.customer_notes && (
                                                <div className="text-[10px] text-amber-700 italic pl-3">
                                                    Catatan: "{item.customer_notes}"
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>

                            <div className="border-t border-dashed border-neutral-300 my-2" />

                            {/* Ringkasan Pembayaran */}
                            <div className="space-y-1 text-[11px]">
                                <div className="flex justify-between text-neutral-600">
                                    <span>Subtotal</span>
                                    <span>{formatRupiah(selectedOrderForReceipt.subtotal)}</span>
                                </div>
                                <div className="flex justify-between font-black text-sm pt-1 border-t border-dotted border-neutral-300 text-neutral-900">
                                    <span>TOTAL</span>
                                    <span>{formatRupiah(selectedOrderForReceipt.total_amount)}</span>
                                </div>
                                <div className="flex justify-between text-[11px] pt-1 items-center">
                                    <span className="text-neutral-600">Metode Bayar</span>
                                    <span className="uppercase font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                        {selectedOrderForReceipt.payment_method ?? 'TUNAI'} (LUNAS)
                                    </span>
                                </div>
                            </div>

                            <div className="border-t border-dashed border-neutral-300 my-2" />

                            <div className="text-center text-[10px] text-neutral-500 space-y-0.5 font-sans">
                                <p className="font-semibold text-neutral-700">Terima Kasih atas Kunjungan Anda!</p>
                                <p>Pesanan langsung diteruskan ke racik barista ☕</p>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0 font-sans">
                        <Button
                            variant="outline"
                            onClick={() => setIsReceiptModalOpen(false)}
                            className="text-xs"
                        >
                            Tutup
                        </Button>
                        <Button
                            onClick={() => window.print()}
                            className="bg-[#C82A2A] hover:bg-[#A92222] text-white font-bold text-xs flex items-center gap-2"
                        >
                            <Printer className="size-3.5" />
                            <span>Cetak Struk Sekarang</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 6: LOGOUT SHIFT */}
            {/* ========================================================================= */}
            <Dialog open={isLogoutModalOpen} onOpenChange={setIsLogoutModalOpen}>
                <DialogContent className="max-w-sm bg-white border-[#EFE7D8] text-neutral-900">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#C82A2A]">
                            <LogOut className="size-5" />
                            Keluar dari Shift Kasir?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-500">
                            Pastikan seluruh pesanan aktif telah diserahterimakan ke staf kasir berikutnya.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsLogoutModalOpen(false)}
                            className="bg-white border-neutral-200 text-xs"
                        >
                            Batal
                        </Button>
                        <Button
                            onClick={() => router.post('/logout')}
                            className="bg-[#C82A2A] hover:bg-red-800 text-white font-bold text-xs"
                        >
                            Ya, Keluar Shift
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
