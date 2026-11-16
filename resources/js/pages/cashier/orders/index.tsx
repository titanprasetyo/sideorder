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
    Eye,
    FileText,
    Flame,
    History,
    Home,
    Image as ImageIcon,
    Kanban,
    Layers,
    List,
    Loader2,
    LogOut,
    MoreVertical,
    Printer,
    QrCode,
    RefreshCw,
    Search,
    Sparkles,
    Tag,
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
import { cn } from '@/lib/utils';
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
    order_status:
        | 'pending'
        | 'processing'
        | 'ready'
        | 'completed'
        | 'cancelled';
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

interface CashierOptionItem {
    id: number;
    name: string;
    icon?: string | null;
    additional_price: string | number;
    is_default: boolean;
    is_active: boolean;
}

interface CashierOptionGroup {
    id: number;
    name: string;
    selection_type: 'single' | 'multiple';
    is_required: boolean;
    option_items: CashierOptionItem[];
}

interface CashierMenu {
    id: number;
    category_id: number;
    name: string;
    slug: string;
    description: string | null;
    image_path: string | null;
    base_price: string;
    is_discount_active?: boolean;
    discount_type?: 'percent' | 'fixed' | null;
    discount_value?: string | number | null;
    final_price?: number;
    discount_amount?: number;
    is_active: boolean;
    is_limited_stock?: boolean;
    stock_quantity?: number;
    created_at?: string;
    updated_at?: string;
    category?: { id: number; name: string };
    option_groups?: CashierOptionGroup[];
}

function isCashierMenuAvailable(menu: CashierMenu): boolean {
    return Boolean(
        menu.is_active &&
            (!menu.is_limited_stock || (menu.stock_quantity ?? 0) > 0),
    );
}

interface CashierCategory {
    id: number;
    name: string;
    slug?: string;
    menus?: CashierMenu[];
}

interface Props {
    orders: Order[] | { data: Order[]; total?: number };
    counts: {
        pending: number;
        processing: number;
        ready: number;
        completed_today: number;
        active?: number;
        all?: number;
        menus_total?: number;
        menus_active?: number;
        menus_discounted?: number;
    };
    stats?: {
        processing_amount?: number;
        completed_amount?: number;
        ready_tables?: string[];
        active_tables_count?: number;
    };
    menuCatalog?: CashierCategory[];
    allMenus?: CashierMenu[];
    dateFilter?: string;
}

export default function CashierOrdersIndex({
    orders,
    counts,
    stats,
    menuCatalog = [],
    allMenus = [],
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

    // State katalog menu ter-update dari admin
    const [localMenuCatalog, setLocalMenuCatalog] =
        useState<CashierCategory[]>(menuCatalog);
    const [localAllMenus, setLocalAllMenus] = useState<CashierMenu[]>(allMenus);
    const [menuSearchQuery, setMenuSearchQuery] = useState('');
    const [selectedMenuCategory, setSelectedMenuCategory] = useState<
        number | 'all'
    >('all');
    const [menuStatusFilter, setMenuStatusFilter] = useState<
        'all' | 'promo' | 'active' | 'inactive'
    >('all');
    const [menuSortBy, setMenuSortBy] = useState<
        'newest' | 'name' | 'price_asc' | 'price_desc'
    >('newest');
    const [isMenuNoticeVisible, setIsMenuNoticeVisible] = useState(true);
    const [inspectingMenu, setInspectingMenu] = useState<CashierMenu | null>(
        null,
    );

    const isFirstMenuSyncRef = useRef<boolean>(true);
    const knownMenuIdsRef = useRef<Set<number>>(
        new Set(allMenus.map((m) => m.id)),
    );
    const prevMenusMapRef = useRef<Map<number, CashierMenu>>(
        new Map(allMenus.map((m) => [m.id, m])),
    );

    const recentlyUpdatedMenus = useMemo(() => {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return localAllMenus.filter((m) => {
            const time = new Date(m.updated_at || m.created_at || 0).getTime();
            return time > oneDayAgo;
        });
    }, [localAllMenus]);

    // View State: 'queue' (Tampilan Antrean Tabel sesuai gambar), 'kanban' (Kartu KDS), 'history', 'menu_info' (Pembaruan Menu Admin)
    const [currentView, setCurrentView] = useState<
        'queue' | 'kanban' | 'history' | 'menu_info'
    >('queue');
    const [activeTab, setActiveTab] = useState<
        'all' | 'pending' | 'processing' | 'ready' | 'completed'
    >('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'table'>(
        'newest',
    );
    const [searchQuery, setSearchQuery] = useState('');

    // Checklist Item state
    const [checkedItems, setCheckedItems] = useState<Record<number, boolean>>(
        () => {
            if (typeof window === 'undefined') return {};
            try {
                const saved = localStorage.getItem(
                    'sideline_cashier_item_checks',
                );
                return saved ? JSON.parse(saved) : {};
            } catch {
                return {};
            }
        },
    );

    useEffect(() => {
        try {
            localStorage.setItem(
                'sideline_cashier_item_checks',
                JSON.stringify(checkedItems),
            );
        } catch {}
    }, [checkedItems]);

    // State Pelacak Tombol Loading per Order ID
    const [processingOrderIds, setProcessingOrderIds] = useState<
        Record<number, boolean>
    >({});

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
    const [currentDateString, setCurrentDateString] =
        useState('Sel, 27 Okt 2026');

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
                }),
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
    const knownOrderIdsRef = useRef<Set<number>>(
        new Set(serverOrdersList.map((o) => o.id)),
    );
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

    const setOptimisticOrderLock = (
        orderId: number,
        patch: Partial<Order>,
        ttlMs = 15000,
    ) => {
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
        menuCatalog?: CashierCategory[];
        allMenus?: CashierMenu[];
    }) => {
        if (!data) return;
        const incomingList: Order[] = Array.isArray(data.orders)
            ? data.orders
            : (data.orders?.data ?? []);

        const newIncoming = incomingList.filter(
            (o) =>
                !knownOrderIdsRef.current.has(o.id) &&
                (o.order_status === 'pending' ||
                    o.order_status === 'processing'),
        );

        if (newIncoming.length > 0) {
            if (soundEnabledRef.current) {
                playOrderChime();
            }
            newIncoming.forEach((o) => {
                toast.success(
                    `🔔 Pesanan Baru Masuk! Meja ${o.table?.table_number ?? '00'}`,
                    {
                        description: `${o.customer_name} • Total: ${formatRupiah(o.total_amount)}`,
                        duration: 7000,
                    },
                );
            });
        }

        incomingList.forEach((o) => knownOrderIdsRef.current.add(o.id));

        setLocalOrders((prevLocalOrders) => {
            const localOrdersMap = new Map(
                prevLocalOrders.map((o) => [o.id, o]),
            );

            const merged = incomingList.map((serverOrder) => {
                const localOrder = localOrdersMap.get(serverOrder.id);
                const lockEntry = optimisticLocksRef.current.get(
                    serverOrder.id,
                );
                const patch = lockEntry ? lockEntry.patch : null;
                const orderInFlight =
                    (inFlightByOrderRef.current[serverOrder.id] ?? 0) > 0;

                let effectiveStatus = serverOrder.order_status;
                if (serverOrder.order_status !== 'cancelled') {
                    if (patch?.order_status) {
                        const patchRank = STAGE_RANK[patch.order_status] ?? 0;
                        const currentRank = STAGE_RANK[effectiveStatus] ?? 0;
                        if (patchRank > currentRank) {
                            effectiveStatus = patch.order_status;
                        }
                    }
                    if (
                        localOrder?.order_status &&
                        localOrder.order_status !== 'cancelled'
                    ) {
                        const localRank =
                            STAGE_RANK[localOrder.order_status] ?? 0;
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
                        STAGE_RANK[serverOrder.order_status] >=
                            STAGE_RANK[patch.order_status]) &&
                    (!patch?.payment_status ||
                        serverOrder.payment_status === patch.payment_status)
                ) {
                    optimisticLocksRef.current.delete(serverOrder.id);
                }

                return {
                    ...serverOrder,
                    ...patch,
                    order_status: effectiveStatus,
                    payment_status: effectivePayment,
                };
            });

            return merged;
        });

        if (data.counts) {
            const incomingCounts = data.counts;
            setLiveCounts((prev) => {
                if (activeMutationsCountRef.current === 0)
                    return incomingCounts;
                return {
                    ...incomingCounts,
                    completed_today: Math.max(
                        prev.completed_today ?? 0,
                        incomingCounts.completed_today ?? 0,
                    ),
                };
            });
        }
        if (data.stats) {
            const incomingStats = data.stats;
            setLiveStats((prev) => {
                if (!prev || activeMutationsCountRef.current === 0)
                    return incomingStats;
                return {
                    ...incomingStats,
                    completed_amount: Math.max(
                        prev.completed_amount ?? 0,
                        incomingStats.completed_amount ?? 0,
                    ),
                };
            });
        }
        if (data.menuCatalog) setLocalMenuCatalog(data.menuCatalog);
        if (data.allMenus && Array.isArray(data.allMenus)) {
            const incomingMenus = data.allMenus;
            if (!isFirstMenuSyncRef.current) {
                // Deteksi menu baru yang ditambahkan oleh admin
                const newlyAdded = incomingMenus.filter(
                    (m) => !knownMenuIdsRef.current.has(m.id),
                );
                if (newlyAdded.length > 0) {
                    newlyAdded.forEach((m) => {
                        toast.info(`📋 Menu Baru dari Admin: "${m.name}"`, {
                            description: `Kategori: ${m.category?.name || 'Umum'} • Harga: ${formatRupiah(m.final_price ?? m.base_price)}`,
                            duration: 7000,
                            action: {
                                label: 'Lihat Menu',
                                onClick: () => {
                                    setCurrentView('menu_info');
                                    setInspectingMenu(m);
                                },
                            },
                        });
                    });
                }

                // Deteksi menu yang diupdate oleh admin (promo, harga, status)
                const newlyUpdated = incomingMenus.filter((m) => {
                    const prev = prevMenusMapRef.current.get(m.id);
                    if (!prev) return false;
                    return (
                        prev.updated_at !== m.updated_at &&
                        (prev.base_price !== m.base_price ||
                            prev.is_discount_active !== m.is_discount_active ||
                            prev.discount_value !== m.discount_value ||
                            prev.discount_type !== m.discount_type ||
                            prev.is_active !== m.is_active ||
                            prev.is_limited_stock !== m.is_limited_stock ||
                            prev.stock_quantity !== m.stock_quantity ||
                            prev.name !== m.name)
                    );
                });

                if (newlyUpdated.length > 0) {
                    newlyUpdated.forEach((m) => {
                        const prev = prevMenusMapRef.current.get(m.id);
                        let changeSummary = 'Data menu diperbarui oleh admin.';
                        if (
                            prev &&
                            prev.is_discount_active !== m.is_discount_active
                        ) {
                            changeSummary = m.is_discount_active
                                ? `Promo diskon aktif: ${m.discount_type === 'percent' ? `${m.discount_value}%` : formatRupiah(m.discount_value || 0)}`
                                : 'Promo diskon dinonaktifkan oleh Admin.';
                        } else if (prev && prev.base_price !== m.base_price) {
                            changeSummary = `Harga berubah dari ${formatRupiah(prev.base_price)} ke ${formatRupiah(m.base_price)}`;
                        } else if (
                            prev &&
                            isCashierMenuAvailable(prev) !==
                                isCashierMenuAvailable(m)
                        ) {
                            changeSummary = isCashierMenuAvailable(m)
                                ? 'Menu diubah jadi Tersedia'
                                : 'Menu ditandai Habis/Nonaktif';
                        }

                        toast.info(`🔄 Admin Memperbarui Menu: "${m.name}"`, {
                            description: changeSummary,
                            duration: 7000,
                            action: {
                                label: 'Cek Detail',
                                onClick: () => {
                                    setCurrentView('menu_info');
                                    setInspectingMenu(m);
                                },
                            },
                        });
                    });
                }
            } else {
                isFirstMenuSyncRef.current = false;
            }

            incomingMenus.forEach((m) => {
                knownMenuIdsRef.current.add(m.id);
                prevMenusMapRef.current.set(m.id, m);
            });
            setLocalAllMenus(incomingMenus);
        }
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

                const response = await fetch(
                    `/cashier/orders/sync?date=${dateFilter}`,
                    {
                        signal: controller.signal,
                        credentials: 'same-origin',
                        headers: {
                            Accept: 'application/json',
                            'X-Requested-With': 'XMLHttpRequest',
                        },
                    },
                );

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
            localStorage.setItem(
                'sideline_cashier_sound',
                next ? 'enabled' : 'disabled',
            );
        } catch {}

        if (next) {
            playOrderChime();
            toast.success('Bel Notifikasi Aktif (Tes Suara)');
        } else {
            toast.info('Bel notifikasi dinonaktifkan');
        }
    };

    const formatRupiah = (amount: number | string) => {
        const num =
            typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
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
    const [acceptedOrders, setAcceptedOrders] = useState<
        Record<number, boolean>
    >(() => {
        if (typeof window === 'undefined') return {};
        try {
            const saved = localStorage.getItem(
                'sideline_cashier_accepted_orders',
            );
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
                localStorage.setItem(
                    'sideline_cashier_accepted_orders',
                    JSON.stringify(next),
                );
            } catch {}
            return next;
        });

        if (nextVal) {
            if (soundEnabled) playOrderChime();
            toast.success(
                `✅ Meja ${order.table?.table_number ?? '00'}: Pesanan diterima!`,
            );
        } else {
            toast.info(
                `Meja ${order.table?.table_number ?? '00'}: Tanda terima dibatalkan.`,
            );
        }
    };

    // Modal Pembayaran
    const [selectedOrderForPayment, setSelectedOrderForPayment] =
        useState<Order | null>(null);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentMethod, setPaymentMethod] = useState<
        'cash' | 'qris' | 'transfer' | 'debit'
    >('cash');
    const [cashReceived, setCashReceived] = useState<string>('');

    // Modal Batal Pesan (Sederhana & Bersih)
    const [selectedOrderForCancel, setSelectedOrderForCancel] =
        useState<Order | null>(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    // Modal Cetak Struk (Memuat rincian item lengkap)
    const [selectedOrderForReceipt, setSelectedOrderForReceipt] =
        useState<Order | null>(null);
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

            const xsrfMatch = document.cookie.match(
                /(?:^|;\s*)XSRF-TOKEN=([^;]+)/,
            );
            if (xsrfMatch?.[1]) {
                try {
                    headers['X-XSRF-TOKEN'] = decodeURIComponent(xsrfMatch[1]);
                } catch {}
            }
        }

        return headers;
    };

    const enqueueOrderMutation = (
        orderId: number,
        task: () => Promise<void>,
    ) => {
        abortActiveSync();
        activeMutationsCountRef.current += 1;
        inFlightByOrderRef.current[orderId] =
            (inFlightByOrderRef.current[orderId] ?? 0) + 1;
        isActionInFlightRef.current = true;
        setProcessingOrderIds((prev) => ({ ...prev, [orderId]: true }));

        const previousPromise =
            orderActionQueueRef.current[orderId] ?? Promise.resolve();
        const nextPromise = previousPromise
            .catch(() => {})
            .then(async () => {
                try {
                    await task();
                } finally {
                    inFlightByOrderRef.current[orderId] = Math.max(
                        0,
                        (inFlightByOrderRef.current[orderId] ?? 1) - 1,
                    );
                    activeMutationsCountRef.current = Math.max(
                        0,
                        activeMutationsCountRef.current - 1,
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
        note?: string,
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
            toast.error(
                'Pesanan belum lunas! Harap konfirmasi pembayaran terlebih dahulu.',
            );
            openPaymentModal(order);
            return;
        }

        const oldStatus = order.order_status;
        const targetOrderId = order.id;
        const targetOrderNumber = order.order_number;
        const orderTotal = parseFloat(order.total_amount) || 0;

        setOptimisticOrderLock(targetOrderId, { order_status: newStatus });

        setLocalOrders((prev) =>
            prev.map((o) =>
                o.id === targetOrderId ? { ...o, order_status: newStatus } : o,
            ),
        );

        // Optimistically update live counts & stats immediately (0ms)
        setLiveCounts((prev) => {
            if (!prev) return prev;
            const updated = { ...prev };
            if (oldStatus === 'pending')
                updated.pending = Math.max(0, (updated.pending ?? 1) - 1);
            if (oldStatus === 'processing')
                updated.processing = Math.max(0, (updated.processing ?? 1) - 1);
            if (oldStatus === 'ready')
                updated.ready = Math.max(0, (updated.ready ?? 1) - 1);

            if (newStatus === 'processing')
                updated.processing = (updated.processing ?? 0) + 1;
            if (newStatus === 'ready') updated.ready = (updated.ready ?? 0) + 1;
            if (newStatus === 'completed')
                updated.completed_today = (updated.completed_today ?? 0) + 1;

            return updated;
        });

        if (newStatus === 'completed') {
            setLiveStats((prev) =>
                prev
                    ? {
                          ...prev,
                          completed_amount:
                              (prev.completed_amount ?? 0) + orderTotal,
                      }
                    : prev,
            );
        }

        const statusLabels: Record<string, string> = {
            processing: 'Sedang Diracik Barista',
            ready: 'Siap Disajikan di Meja',
            completed: 'Pesanan Selesai',
            cancelled: 'Dibatalkan',
        };

        toast.success(
            `Meja ${order.table?.table_number ?? '00'}: ${statusLabels[newStatus] || newStatus}!`,
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
                    },
                );

                const data = await res.json().catch(() => null);

                if (!res.ok || data?.success === false) {
                    if (res.status === 419) {
                        toast.error(
                            'Sesi login telah kedaluwarsa (CSRF token mismatch). Memuat ulang halaman...',
                        );
                        setTimeout(() => {
                            window.location.reload();
                        }, 1500);
                        return;
                    }
                    const errMsg =
                        data?.message || 'Gagal mengubah status pesanan.';
                    throw new Error(errMsg);
                }

                if (
                    (inFlightByOrderRef.current[targetOrderId] ?? 0) <= 1 &&
                    data?.orders
                ) {
                    updateStateFromIncoming(data);
                }
            } catch (err: any) {
                optimisticLocksRef.current.delete(targetOrderId);
                setLocalOrders((prev) =>
                    prev.map((o) =>
                        o.id === targetOrderId
                            ? { ...o, order_status: oldStatus }
                            : o,
                    ),
                );

                // Rollback optimistic live counts & stats
                setLiveCounts((prev) => {
                    if (!prev) return prev;
                    const rolled = { ...prev };
                    if (newStatus === 'processing')
                        rolled.processing = Math.max(
                            0,
                            (rolled.processing ?? 1) - 1,
                        );
                    if (newStatus === 'ready')
                        rolled.ready = Math.max(0, (rolled.ready ?? 1) - 1);
                    if (newStatus === 'completed')
                        rolled.completed_today = Math.max(
                            0,
                            (rolled.completed_today ?? 1) - 1,
                        );

                    if (oldStatus === 'pending')
                        rolled.pending = (rolled.pending ?? 0) + 1;
                    if (oldStatus === 'processing')
                        rolled.processing = (rolled.processing ?? 0) + 1;
                    if (oldStatus === 'ready')
                        rolled.ready = (rolled.ready ?? 0) + 1;

                    return rolled;
                });

                if (newStatus === 'completed') {
                    setLiveStats((prev) =>
                        prev
                            ? {
                                  ...prev,
                                  completed_amount: Math.max(
                                      0,
                                      (prev.completed_amount ?? 0) - orderTotal,
                                  ),
                              }
                            : prev,
                    );
                }

                toast.error(err?.message || 'Gagal mengubah status pesanan.');
                void syncNow(false);
            }
        });
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
                    localStorage.setItem(
                        'sideline_cashier_accepted_orders',
                        JSON.stringify(next),
                    );
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
                toast.error(
                    'Pesanan belum lunas! Harap konfirmasi pembayaran terlebih dahulu.',
                );
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
                    `Uang tunai kurang! Minimal bayar: ${formatRupiah(amountDue)}`,
                );
                return;
            }
        }

        const orderId = order.id;
        const orderNumber = order.order_number;
        // Alur otomatis: setelah bayar, pesanan diteruskan ke racik barista ('processing')
        const newStatusAfterPay =
            order.order_status === 'pending'
                ? 'processing'
                : order.order_status;

        // Pastikan checkbox diterima tercentang
        setAcceptedOrders((prev) => {
            const next = { ...prev, [orderId]: true };
            try {
                localStorage.setItem(
                    'sideline_cashier_accepted_orders',
                    JSON.stringify(next),
                );
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
            prev.map((o) => (o.id === orderId ? updatedOrder : o)),
        );

        if (order.order_status === 'pending') {
            setLiveCounts((prev) =>
                prev
                    ? {
                          ...prev,
                          pending: Math.max(0, (prev.pending ?? 1) - 1),
                          processing: (prev.processing ?? 0) + 1,
                      }
                    : prev,
            );
        }

        // Tutup modal bayar
        setIsPaymentModalOpen(false);

        // Buka otomatis modal Cetak Struk dan beri info teruskan ke racik
        setSelectedOrderForReceipt(updatedOrder);
        setIsReceiptModalOpen(true);
        if (soundEnabled) playOrderChime();

        toast.success(
            `✅ Pembayaran #${orderNumber} Lunas! Pesanan diteruskan ke racik barista.`,
        );

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
                            cash_received:
                                paymentMethod === 'cash'
                                    ? parseFloat(cashReceived)
                                    : amountDue,
                            change_amount:
                                paymentMethod === 'cash'
                                    ? Math.max(
                                          0,
                                          parseFloat(cashReceived) - amountDue,
                                      )
                                    : 0,
                            date: dateFilter,
                        }),
                    },
                );

                const data = await res.json().catch(() => null);
                if (!res.ok || data?.success === false) {
                    if (res.status === 419) {
                        toast.error(
                            'Sesi login telah kedaluwarsa (CSRF token mismatch). Memuat ulang halaman...',
                        );
                        setTimeout(() => {
                            window.location.reload();
                        }, 1500);
                        return;
                    }
                    throw new Error(
                        data?.message || 'Gagal memproses pembayaran.',
                    );
                }

                if (
                    (inFlightByOrderRef.current[orderId] ?? 0) <= 1 &&
                    data?.orders
                ) {
                    updateStateFromIncoming(data);
                }
            } catch (err: any) {
                optimisticLocksRef.current.delete(orderId);
                toast.error(err?.message || 'Gagal memproses pembayaran.');
                void syncNow(false);
            }
        });
    };

    // BATALKAN PESANAN (Hanya untuk pesanan belum dibayar; pesanan lunas/terbayar tidak bisa dibatalkan atau direfund)
    const openCancelModal = (order: Order) => {
        if (
            order.payment_status === 'paid' ||
            Number(order.settled_amount ?? 0) > 0
        ) {
            toast.error('Pesanan yang sudah dibayar tidak dapat dibatalkan.');
            return;
        }
        setSelectedOrderForCancel(order);
        setCancelReason('');
        setIsCancelModalOpen(true);
    };

    const handleCancelOrderSubmit = () => {
        if (!selectedOrderForCancel) return;
        const order = selectedOrderForCancel;
        if (
            order.payment_status === 'paid' ||
            Number(order.settled_amount ?? 0) > 0
        ) {
            toast.error('Pesanan yang sudah dibayar tidak dapat dibatalkan.');
            setIsCancelModalOpen(false);
            return;
        }
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

    // HITUNG COUNTS & STATS (100% INSTANT OPTIMISTIC DI KASIR)
    const countsLive = useMemo(() => {
        const pending = localOrders.filter((o) => o.order_status === 'pending');
        const processing = localOrders.filter(
            (o) => o.order_status === 'processing',
        );
        const ready = localOrders.filter((o) => o.order_status === 'ready');
        const completed = localOrders.filter(
            (o) => o.order_status === 'completed',
        );

        return {
            pending: pending.length,
            processing: processing.length,
            ready: ready.length,
            completed_today: Math.max(
                completed.length,
                liveCounts?.completed_today ?? 0,
            ),
            all: localOrders.length,
        };
    }, [localOrders, liveCounts]);

    const statsProcessingAmount = useMemo(() => {
        return localOrders
            .filter((o) => o.order_status === 'processing')
            .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
    }, [localOrders]);

    const statsCompletedAmount = useMemo(() => {
        const localCompletedSum = localOrders
            .filter((o) => o.order_status === 'completed')
            .reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
        const serverCompletedAmount = liveStats?.completed_amount ?? 0;
        return Math.max(localCompletedSum, serverCompletedAmount);
    }, [localOrders, liveStats]);

    const readyTablesList = useMemo(() => {
        const ready = localOrders.filter((o) => o.order_status === 'ready');
        if (ready.length === 0) return 'Tidak ada antrian';
        const tables = Array.from(
            new Set(ready.map((o) => `Meja ${o.table?.table_number ?? '00'}`)),
        );
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
                const matchTable = (o.table?.table_number ?? '')
                    .toLowerCase()
                    .includes(q);
                const matchCustomer = (o.customer_name ?? '')
                    .toLowerCase()
                    .includes(q);
                const matchOrderNum = (o.order_number ?? '')
                    .toLowerCase()
                    .includes(q);
                const matchItem = o.items.some((it) =>
                    it.menu_name.toLowerCase().includes(q),
                );
                return (
                    matchTable || matchCustomer || matchOrderNum || matchItem
                );
            });
        }

        // Sort
        list.sort((a, b) => {
            if (sortBy === 'newest') {
                return (
                    new Date(b.created_at).getTime() -
                    new Date(a.created_at).getTime()
                );
            } else if (sortBy === 'oldest') {
                return (
                    new Date(a.created_at).getTime() -
                    new Date(b.created_at).getTime()
                );
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

            <div className="flex h-screen w-full overflow-hidden bg-[#FAF7F0] font-sans text-neutral-900 select-none">
                {/* ========================================================================= */}
                {/* 1. SIDEBAR KASIR (Warm Cream Elegant Theme) */}
                {/* ========================================================================= */}
                <aside className="z-20 flex w-56 flex-shrink-0 flex-col justify-between border-r border-[#EFE8DD] bg-[#FBF8F2] p-3.5 lg:w-64 lg:p-4">
                    <div className="space-y-5">
                        {/* Cafe Brand Header */}
                        <div className="flex items-center gap-3 px-1 pt-1">
                            <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F3080A] text-white shadow-sm ring-1 shadow-[#F3080A]/20 ring-black/5">
                                <img
                                    src="/images/sideline-icon.png"
                                    alt="SIDELINE"
                                    className="size-full object-cover"
                                />
                            </div>
                            <div className="min-w-0">
                                <h1 className="truncate text-sm leading-tight font-black tracking-tight text-neutral-900 uppercase">
                                    SIDELINE
                                </h1>
                                <p className="truncate text-[10px] font-bold tracking-[0.14em] text-neutral-400 uppercase">
                                    COFFEE &bull; EATERY
                                </p>
                            </div>
                        </div>

                        {/* Navigation Menu */}
                        <nav className="space-y-1.5">
                            {/* 1. Kasir Aktif (Transaksi & Pesanan) */}
                            <button
                                type="button"
                                onClick={() => setCurrentView('queue')}
                                className={`flex w-full cursor-pointer items-center justify-between rounded-2xl p-2.5 text-left transition-all sm:p-3 ${
                                    currentView === 'queue' ||
                                    currentView === 'kanban'
                                        ? 'bg-[#EFE7D8] font-bold text-neutral-900 shadow-2xs'
                                        : 'text-neutral-700 hover:bg-[#F3ECE0]'
                                }`}
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="shrink-0 rounded-lg p-1">
                                        <Home className="size-4 text-neutral-800" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="truncate text-xs leading-tight font-bold text-neutral-900">
                                            Kasir Aktif
                                        </div>
                                        <div className="truncate text-[10px] font-medium text-neutral-500">
                                            Transaksi & Pesanan
                                        </div>
                                    </div>
                                </div>
                                <span className="mr-1 size-2 shrink-0 rounded-full bg-emerald-500" />
                            </button>

                            {/* 2. Riwayat Selesai */}
                            <button
                                type="button"
                                onClick={() => setCurrentView('history')}
                                className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                                    currentView === 'history'
                                        ? 'bg-[#EFE7D8] font-bold text-neutral-900 shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#F3ECE0]'
                                }`}
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <Clock className="size-4 shrink-0 text-neutral-600" />
                                    <span className="truncate">
                                        Riwayat Selesai
                                    </span>
                                </div>
                                <span className="shrink-0 rounded-full bg-[#EAE2D3] px-2 py-0.5 text-[10px] font-bold text-neutral-700">
                                    {countsLive.completed_today}
                                </span>
                            </button>

                            {/* 3. Daftar & Pembaruan Menu dari Admin */}
                            <button
                                type="button"
                                onClick={() => setCurrentView('menu_info')}
                                className={`flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                                    currentView === 'menu_info'
                                        ? 'bg-[#EFE7D8] font-bold text-neutral-900 shadow-2xs'
                                        : 'text-neutral-600 hover:bg-[#F3ECE0]'
                                }`}
                            >
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <Coffee className="size-4 shrink-0 text-[#C82A2A]" />
                                    <div className="min-w-0">
                                        <span className="block truncate">
                                            Pembaruan Menu
                                        </span>
                                        <span className="block truncate text-[10px] font-normal text-neutral-500">
                                            Input & Diskon Admin
                                        </span>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                    {localAllMenus.some(
                                        (m) =>
                                            m.is_discount_active &&
                                            (m.discount_amount || 0) > 0,
                                    ) && (
                                        <span
                                            className="flex items-center gap-0.5 rounded-full bg-[#FDECEB] px-1.5 py-0.5 text-[9.5px] font-extrabold text-[#C52828]"
                                            title="Menu sedang promo diskon"
                                        >
                                            <Flame className="size-2.5" />
                                            {
                                                localAllMenus.filter(
                                                    (m) =>
                                                        m.is_discount_active &&
                                                        (m.discount_amount ||
                                                            0) > 0,
                                                ).length
                                            }
                                        </span>
                                    )}
                                    <span className="rounded-full bg-[#EAE2D3] px-2 py-0.5 text-[10px] font-bold text-neutral-700">
                                        {localAllMenus.length}
                                    </span>
                                </div>
                            </button>

                            {/* Admin back link */}
                            {isAdmin && (
                                <Link
                                    href="/admin/orders"
                                    className="mt-2 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-[#C82A2A] transition-all hover:bg-[#F3ECE0]"
                                >
                                    <ArrowRight className="size-4 shrink-0 rotate-180 text-[#C82A2A]" />
                                    <span className="truncate">
                                        Panel Administrator
                                    </span>
                                </Link>
                            )}
                        </nav>
                    </div>

                    {/* Bottom Profile & Logout Shift */}
                    <div className="space-y-3 border-t border-[#EFE8DD] pt-3.5">
                        <div className="flex items-center gap-2.5 px-1">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#E5D7B7] text-xs font-bold text-neutral-800">
                                {staffName.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-bold text-neutral-900">
                                    {staffName}
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] font-medium text-neutral-500">
                                    <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                                    <span className="truncate">
                                        {isAdmin
                                            ? 'Administrator'
                                            : 'Kasir Aktif'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setIsLogoutModalOpen(true)}
                            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-neutral-200/80 bg-white px-2.5 py-2 text-xs font-semibold text-neutral-800 shadow-2xs transition-all hover:bg-neutral-50"
                        >
                            <LogOut className="size-3.5 shrink-0 text-neutral-600" />
                            <span className="truncate">
                                Keluar Shift / Logout
                            </span>
                        </button>
                    </div>
                </aside>

                {/* ========================================================================= */}
                {/* 2. MAIN CONTENT AREA */}
                {/* ========================================================================= */}
                <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
                    {/* TOP HEADER BAR */}
                    <header className="flex h-16 flex-shrink-0 items-center justify-between gap-3 border-b border-[#EFE8DD]/70 bg-[#FAF7F0] px-4 lg:px-6">
                        {/* Title & Real-Time Status */}
                        <div className="shrink-0">
                            <h2 className="text-sm leading-tight font-bold tracking-tight text-neutral-900 lg:text-base">
                                SIDE LINE Cafe – Kasir
                            </h2>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-neutral-500 lg:text-[11px]">
                                <span>
                                    {liveStats?.active_tables_count ?? 4} Meja
                                    Aktif
                                </span>
                                <span>•</span>
                                <span className="flex items-center gap-1 font-semibold text-neutral-800">
                                    <span className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                                    <span className="text-[#C82A2A]">
                                        Live ({latencyMs}ms)
                                    </span>
                                </span>
                            </div>
                        </div>

                        {/* Search Input Bar */}
                        <div className="relative max-w-xs min-w-[130px] flex-1 xl:max-w-sm">
                            <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-neutral-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari No. Meja / Order ID / Menu..."
                                className="h-8 w-full rounded-full border border-[#E8DFC8] bg-white pr-8 pl-8 text-xs text-neutral-800 shadow-2xs transition-colors placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none sm:h-9"
                            />
                            {searchQuery ? (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute top-1/2 right-2.5 -translate-y-1/2 cursor-pointer text-neutral-400 hover:text-neutral-700"
                                >
                                    <X className="size-3.5" />
                                </button>
                            ) : (
                                <kbd className="absolute top-1/2 right-3 hidden -translate-y-1/2 font-mono text-[10px] text-neutral-400 sm:inline-block">
                                    /
                                </kbd>
                            )}
                        </div>

                        {/* Right Controls: Clock, Sound Bell, Print Button */}
                        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
                            {/* Live Clock Card */}
                            <div className="hidden items-center gap-2 rounded-xl border border-[#E8DFC8] bg-white px-2.5 py-1 text-neutral-800 shadow-2xs sm:flex lg:px-3">
                                <Clock className="size-3.5 shrink-0 text-amber-600" />
                                <div className="text-right">
                                    <div className="text-xs leading-tight font-bold text-neutral-900">
                                        {currentTimeString}
                                    </div>
                                    <div className="hidden text-[10px] text-neutral-500 lg:block">
                                        {currentDateString}
                                    </div>
                                </div>
                            </div>

                            {/* Tombol Cepat Pembaruan Menu dari Admin */}
                            <button
                                type="button"
                                onClick={() =>
                                    setCurrentView(
                                        currentView === 'menu_info'
                                            ? 'queue'
                                            : 'menu_info',
                                    )
                                }
                                className={cn(
                                    'flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-bold shadow-2xs transition-all sm:h-9',
                                    currentView === 'menu_info'
                                        ? 'border-[#C82A2A] bg-[#C82A2A] text-white'
                                        : 'border-[#E8DFC8] bg-white text-neutral-800 hover:bg-[#FAF5E8]',
                                )}
                                title="Lihat pembaruan menu, varian, harga, dan promo dari Admin"
                            >
                                <Coffee className="size-3.5" />
                                <span className="hidden sm:inline">
                                    Pembaruan Menu
                                </span>
                                {localAllMenus.some(
                                    (m) =>
                                        m.is_discount_active &&
                                        (m.discount_amount || 0) > 0,
                                ) && (
                                    <span className="size-2 animate-pulse rounded-full bg-amber-400" />
                                )}
                            </button>

                            {/* Bell Notifikasi Button */}
                            <button
                                type="button"
                                onClick={toggleSound}
                                className={`flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold shadow-2xs transition-all sm:h-9 sm:px-3 ${
                                    soundEnabled
                                        ? 'border-emerald-400/80 bg-emerald-50/60 text-emerald-800 hover:bg-emerald-100'
                                        : 'border-neutral-300 bg-white text-neutral-400 hover:bg-neutral-50'
                                }`}
                                title="Klik untuk uji suara bel notifikasi / aktifkan bel"
                            >
                                {soundEnabled ? (
                                    <>
                                        <Volume2 className="size-3.5 shrink-0 text-emerald-700" />
                                        <span className="hidden md:inline">
                                            Bel Aktif
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <VolumeX className="size-3.5 shrink-0 text-neutral-400" />
                                        <span className="hidden md:inline">
                                            Bel Senyap
                                        </span>
                                    </>
                                )}
                            </button>

                            {/* Cetak Struk Terakhir Button */}
                            <button
                                type="button"
                                onClick={printLastReceipt}
                                className="flex h-8 cursor-pointer items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-2.5 text-xs font-semibold text-neutral-800 shadow-2xs transition-all hover:bg-neutral-50 sm:h-9 sm:gap-2 sm:px-3.5"
                                title="Cetak Struk Terakhir"
                            >
                                <Printer className="size-3.5 shrink-0 text-neutral-700" />
                                <span className="hidden sm:inline">
                                    Cetak Struk Terakhir
                                </span>
                            </button>
                        </div>
                    </header>

                    {/* BANNER NOTIFIKASI PEMBARUAN MENU DARI ADMIN */}
                    {recentlyUpdatedMenus.length > 0 &&
                        isMenuNoticeVisible &&
                        currentView !== 'menu_info' && (
                            <div className="mx-4 mt-3 flex flex-shrink-0 animate-in items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-amber-50 px-4 py-2.5 shadow-2xs duration-300 fade-in slide-in-from-top-2 lg:mx-6">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-2xs">
                                        <Sparkles className="size-4" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-black text-amber-950">
                                            Admin Baru Menginput / Memperbarui{' '}
                                            {recentlyUpdatedMenus.length} Menu
                                            Hari Ini
                                        </p>
                                        <p className="truncate text-[11px] text-amber-800">
                                            Terbaru:{' '}
                                            <span className="font-semibold text-neutral-900">
                                                {recentlyUpdatedMenus
                                                    .slice(0, 3)
                                                    .map((m) => m.name)
                                                    .join(', ')}
                                            </span>
                                            {recentlyUpdatedMenus.length > 3 &&
                                                ` (+${recentlyUpdatedMenus.length - 3} lainnya)`}{' '}
                                            • Cek perubahan harga jual,
                                            ketersediaan, & promo diskon.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setCurrentView('menu_info')
                                        }
                                        className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#C82A2A] px-3 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#A32020]"
                                    >
                                        <span>Buka Katalog Menu</span>
                                        <ArrowRight className="size-3" />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setIsMenuNoticeVisible(false)
                                        }
                                        className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-amber-700 transition hover:bg-amber-200/50 hover:text-amber-950"
                                        title="Tutup pemberitahuan ini"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}

                    {/* TOP 4 SUMMARY STATS CARDS */}
                    <div className="grid flex-shrink-0 grid-cols-1 gap-4 px-6 pt-3 pb-2 sm:grid-cols-2 lg:grid-cols-4">
                        {/* 1. Pesanan Baru Masuk */}
                        <div className="flex flex-col justify-between rounded-2xl border border-[#EFE7D8] bg-white p-4 shadow-xs">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex size-7 items-center justify-center rounded-lg bg-red-50 text-[#C82A2A]">
                                        <FileText className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Pesanan Baru Masuk
                                    </span>
                                </div>
                                <span className="rounded-full bg-[#C82A2A] px-2 py-0.5 text-[9px] font-bold tracking-wider text-white uppercase">
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
                                    <span>
                                        {countsLive.pending > 0
                                            ? 'Perlu tindakan'
                                            : 'Tertangani'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* 2. Sedang Diracik Barista */}
                        <div className="flex flex-col justify-between rounded-2xl border border-[#EFE7D8] bg-white p-4 shadow-xs">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex size-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                                        <Coffee className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Sedang Diracik Barista
                                    </span>
                                </div>
                                <span className="rounded-full bg-amber-100/70 px-2 py-0.5 text-[10px] font-bold text-amber-800">
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
                        <div className="flex flex-col justify-between rounded-2xl border border-[#EFE7D8] bg-white p-4 shadow-xs">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                        <UtensilsCrossed className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Siap Saji ke Meja
                                    </span>
                                </div>
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                                    Siap Diantar
                                </span>
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
                        <div className="flex flex-col justify-between rounded-2xl border border-[#EFE7D8] bg-white p-4 shadow-xs">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="flex size-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                                        <CheckCircle2 className="size-4" />
                                    </div>
                                    <span className="text-xs font-bold text-neutral-800">
                                        Selesai Hari Ini
                                    </span>
                                </div>
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
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
                        <div className="flex min-h-0 flex-1 flex-col px-4 pt-1 pb-4 lg:px-6">
                            {/* FILTER TABS & SORT ROW */}
                            <div className="flex flex-shrink-0 items-center justify-between gap-2 py-2">
                                {/* Left Filter Tabs */}
                                <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 sm:gap-2 sm:pb-0">
                                    {/* 1. Semua */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('all')}
                                        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all sm:gap-2 sm:px-4 ${
                                            activeTab === 'all'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'border border-[#E8DFC8] bg-white text-neutral-700 hover:bg-[#FAF5E8]'
                                        }`}
                                    >
                                        <span>Semua</span>
                                        <span
                                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                                                activeTab === 'all'
                                                    ? 'bg-white/25 text-white'
                                                    : 'bg-[#F5EEDC] text-neutral-700'
                                            }`}
                                        >
                                            {countsLive.all}
                                        </span>
                                    </button>

                                    {/* 2. Pesanan Baru */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('pending')}
                                        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:gap-2 sm:px-3.5 ${
                                            activeTab === 'pending'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'border border-[#E8DFC8] bg-white text-neutral-700 hover:bg-[#FAF5E8]'
                                        }`}
                                    >
                                        <Coffee className="size-3.5 shrink-0" />
                                        <span>Pesanan Baru</span>
                                        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-[#C82A2A] text-[10px] font-bold text-white">
                                            {countsLive.pending}
                                        </span>
                                    </button>

                                    {/* 3. Sedang Diracik */}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setActiveTab('processing')
                                        }
                                        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:gap-2 sm:px-3.5 ${
                                            activeTab === 'processing'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'border border-[#E8DFC8] bg-white text-neutral-700 hover:bg-[#FAF5E8]'
                                        }`}
                                    >
                                        <Coffee className="size-3.5 shrink-0" />
                                        <span>Sedang Diracik</span>
                                        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                                            {countsLive.processing}
                                        </span>
                                    </button>

                                    {/* 4. Siap Disajikan */}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('ready')}
                                        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:gap-2 sm:px-3.5 ${
                                            activeTab === 'ready'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'border border-[#E8DFC8] bg-white text-neutral-700 hover:bg-[#FAF5E8]'
                                        }`}
                                    >
                                        <UtensilsCrossed className="size-3.5 shrink-0" />
                                        <span>Siap Disajikan</span>
                                        <span className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                                            {countsLive.ready}
                                        </span>
                                    </button>

                                    {/* 5. Selesai */}
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setActiveTab('completed')
                                        }
                                        className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all sm:gap-2 sm:px-3.5 ${
                                            activeTab === 'completed'
                                                ? 'bg-[#C82A2A] text-white shadow-xs'
                                                : 'border border-[#E8DFC8] bg-white text-neutral-700 hover:bg-[#FAF5E8]'
                                        }`}
                                    >
                                        <CheckCircle2 className="size-3.5 shrink-0" />
                                        <span>Selesai</span>
                                        <span className="shrink-0 rounded-full bg-[#F5EEDC] px-1.5 py-0.5 text-[10px] font-bold text-neutral-700">
                                            {countsLive.completed_today}
                                        </span>
                                    </button>
                                </div>

                                {/* Right Sort & View Toggles */}
                                <div className="flex shrink-0 items-center gap-2">
                                    {/* Sort Dropdown */}
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-[#E8DFC8] bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-700 shadow-2xs hover:bg-[#FAF5E8] sm:px-3"
                                            >
                                                <span>
                                                    {sortBy === 'newest'
                                                        ? 'Terbaru'
                                                        : sortBy === 'oldest'
                                                          ? 'Terlama'
                                                          : 'Meja'}
                                                </span>
                                                <ChevronDown className="size-3.5 text-neutral-400" />
                                            </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent
                                            align="end"
                                            className="border-[#E8DFC8] bg-white text-xs"
                                        >
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setSortBy('newest')
                                                }
                                            >
                                                Urutkan Terbaru (Default)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setSortBy('oldest')
                                                }
                                            >
                                                Urutkan Terlama (FIFO)
                                            </DropdownMenuItem>
                                            <DropdownMenuItem
                                                onClick={() =>
                                                    setSortBy('table')
                                                }
                                            >
                                                Urutkan Nomor Meja
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>

                                    {/* View Toggle (Table vs Kanban) */}
                                    <div className="flex items-center rounded-lg border border-[#E8DFC8] bg-white p-0.5 shadow-2xs">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCurrentView('queue')
                                            }
                                            title="Tampilan Antrean Tabel"
                                            className={`cursor-pointer rounded-md p-1.5 ${
                                                currentView === 'queue'
                                                    ? 'border border-[#DFCFA9] bg-[#FAF5E8] font-bold text-neutral-900'
                                                    : 'text-neutral-400 hover:text-neutral-700'
                                            }`}
                                        >
                                            <List className="size-3.5" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCurrentView('kanban')
                                            }
                                            title="Tampilan Kartu Kanban (KDS Barista)"
                                            className={`cursor-pointer rounded-md p-1.5 ${
                                                currentView === 'kanban'
                                                    ? 'border border-[#DFCFA9] bg-[#FAF5E8] font-bold text-neutral-900'
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
                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#E8DFC8] bg-white shadow-xs">
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full min-w-[800px] border-collapse text-left">
                                            <thead>
                                                <tr className="sticky top-0 z-10 border-b border-[#E8DFC8] bg-[#FAF5E8] text-[11px] font-semibold text-neutral-500">
                                                    <th className="w-14 px-4 py-3 font-medium whitespace-nowrap">
                                                        No.
                                                    </th>
                                                    <th className="w-28 px-4 py-3 font-medium whitespace-nowrap">
                                                        Meja
                                                    </th>
                                                    <th className="w-32 px-4 py-3 font-medium whitespace-nowrap">
                                                        Waktu
                                                    </th>
                                                    <th className="px-4 py-3 font-medium">
                                                        Menu
                                                    </th>
                                                    <th className="w-20 px-4 py-3 text-center font-medium whitespace-nowrap">
                                                        Jumlah
                                                    </th>
                                                    <th className="w-32 px-4 py-3 font-medium whitespace-nowrap">
                                                        Total
                                                    </th>
                                                    <th className="w-36 px-4 py-3 font-medium whitespace-nowrap">
                                                        Status
                                                    </th>
                                                    <th className="w-56 px-4 py-3 pr-4 text-right font-medium whitespace-nowrap">
                                                        Aksi
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-neutral-100 text-xs">
                                                {filteredAndSortedOrders.length ===
                                                0 ? (
                                                    <tr>
                                                        <td
                                                            colSpan={8}
                                                            className="py-16 text-center text-neutral-400"
                                                        >
                                                            <div className="flex flex-col items-center justify-center">
                                                                <FileText className="mb-2 size-9 text-neutral-300" />
                                                                <p className="text-xs font-semibold text-neutral-600">
                                                                    Tidak ada
                                                                    antrian
                                                                    pesanan
                                                                </p>
                                                                <p className="mt-0.5 text-[11px] text-neutral-400">
                                                                    {searchQuery
                                                                        ? `Tidak ditemukan hasil untuk "${searchQuery}"`
                                                                        : 'Pesanan baru dari tamu kafe akan otomatis tampil di sini'}
                                                                </p>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredAndSortedOrders.map(
                                                        (order, index) => {
                                                            const isPending =
                                                                order.order_status ===
                                                                'pending';
                                                            const isProcessing =
                                                                order.order_status ===
                                                                'processing';
                                                            const isReady =
                                                                order.order_status ===
                                                                'ready';
                                                            const isCompleted =
                                                                order.order_status ===
                                                                'completed';
                                                            const isOrderAccepted =
                                                                !!acceptedOrders[
                                                                    order.id
                                                                ] ||
                                                                order.order_status !==
                                                                    'pending';

                                                            // Indikator garis vertikal di sebelah kiri
                                                            let stripeColor =
                                                                'border-l-neutral-300';
                                                            if (isPending)
                                                                stripeColor =
                                                                    'border-l-[#C82A2A]';
                                                            else if (
                                                                isProcessing
                                                            )
                                                                stripeColor =
                                                                    'border-l-amber-400';
                                                            else if (isReady)
                                                                stripeColor =
                                                                    'border-l-emerald-500';
                                                            else if (
                                                                isCompleted
                                                            )
                                                                stripeColor =
                                                                    'border-l-neutral-300';

                                                            const activeItems =
                                                                order.items.filter(
                                                                    (it) =>
                                                                        it.status !==
                                                                        'rejected',
                                                                );
                                                            const totalQty =
                                                                activeItems.reduce(
                                                                    (sum, it) =>
                                                                        sum +
                                                                        it.quantity,
                                                                    0,
                                                                );

                                                            // Tentukan icon makanan atau minuman
                                                            const hasFood =
                                                                activeItems.some(
                                                                    (it) => {
                                                                        const name =
                                                                            it.menu_name.toLowerCase();
                                                                        return (
                                                                            name.includes(
                                                                                'nasi',
                                                                            ) ||
                                                                            name.includes(
                                                                                'mie',
                                                                            ) ||
                                                                            name.includes(
                                                                                'roti',
                                                                            ) ||
                                                                            name.includes(
                                                                                'toast',
                                                                            ) ||
                                                                            name.includes(
                                                                                'sandwich',
                                                                            ) ||
                                                                            name.includes(
                                                                                'croissant',
                                                                            ) ||
                                                                            name.includes(
                                                                                'snack',
                                                                            ) ||
                                                                            name.includes(
                                                                                'goreng',
                                                                            )
                                                                        );
                                                                    },
                                                                );

                                                            return (
                                                                <tr
                                                                    key={
                                                                        order.id
                                                                    }
                                                                    className={`border-l-[3.5px] transition-colors hover:bg-neutral-50/70 ${stripeColor}`}
                                                                >
                                                                    {/* 1. No. */}
                                                                    <td className="px-4 py-3 font-bold text-neutral-800">
                                                                        {String(
                                                                            index +
                                                                                1,
                                                                        ).padStart(
                                                                            2,
                                                                            '0',
                                                                        )}
                                                                    </td>

                                                                    {/* 2. Meja */}
                                                                    <td className="px-4 py-3">
                                                                        <div className="font-bold text-neutral-900">
                                                                            Meja{' '}
                                                                            {order
                                                                                .table
                                                                                ?.table_number ??
                                                                                '00'}
                                                                        </div>
                                                                        <div className="max-w-[100px] truncate text-[10px] text-neutral-400">
                                                                            {
                                                                                order.customer_name
                                                                            }
                                                                        </div>
                                                                    </td>

                                                                    {/* 3. Waktu */}
                                                                    <td className="px-4 py-3">
                                                                        <div className="font-semibold text-neutral-800">
                                                                            {formatTimeOnly(
                                                                                order.created_at,
                                                                            )}
                                                                        </div>
                                                                        <div className="text-[11px] text-neutral-400">
                                                                            {getRelativeMinutes(
                                                                                order.created_at,
                                                                            )}
                                                                        </div>
                                                                    </td>

                                                                    {/* 4. Menu */}
                                                                    <td className="px-4 py-3">
                                                                        <div className="flex items-start gap-2.5">
                                                                            {hasFood ? (
                                                                                <UtensilsCrossed className="mt-0.5 size-4 flex-shrink-0 text-neutral-400" />
                                                                            ) : (
                                                                                <Coffee className="mt-0.5 size-4 flex-shrink-0 text-neutral-400" />
                                                                            )}
                                                                            <div className="space-y-0.5">
                                                                                {activeItems.map(
                                                                                    (
                                                                                        item,
                                                                                    ) => (
                                                                                        <div
                                                                                            key={
                                                                                                item.id
                                                                                            }
                                                                                            className="text-xs leading-snug text-neutral-800"
                                                                                        >
                                                                                            <span className="font-semibold">
                                                                                                {
                                                                                                    item.quantity
                                                                                                }
                                                                                                x
                                                                                            </span>{' '}
                                                                                            <span>
                                                                                                {
                                                                                                    item.menu_name
                                                                                                }
                                                                                            </span>
                                                                                            {item.options &&
                                                                                                item
                                                                                                    .options
                                                                                                    .length >
                                                                                                    0 && (
                                                                                                    <span className="ml-1 text-[10px] text-neutral-500">
                                                                                                        (
                                                                                                        {item.options
                                                                                                            .map(
                                                                                                                (
                                                                                                                    o,
                                                                                                                ) =>
                                                                                                                    o.option_name,
                                                                                                            )
                                                                                                            .join(
                                                                                                                ', ',
                                                                                                            )}
                                                                                                        )
                                                                                                    </span>
                                                                                                )}
                                                                                            {item.customer_notes && (
                                                                                                <span className="block text-[10px] text-amber-700 italic">
                                                                                                    "
                                                                                                    {
                                                                                                        item.customer_notes
                                                                                                    }
                                                                                                    "
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    ),
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </td>

                                                                    {/* 5. Jumlah */}
                                                                    <td className="px-4 py-3 text-center font-medium text-neutral-600">
                                                                        {
                                                                            totalQty
                                                                        }
                                                                    </td>

                                                                    {/* 6. Total */}
                                                                    <td className="px-4 py-3 font-bold text-neutral-900">
                                                                        {formatRupiah(
                                                                            order.total_amount,
                                                                        )}
                                                                    </td>

                                                                    {/* 7. Status Badge & Payment Method */}
                                                                    <td className="px-4 py-3">
                                                                        <div className="space-y-1">
                                                                            <div>
                                                                                {isPending && (
                                                                                    <span className="inline-block rounded-full border border-[#FCD9BD]/50 bg-[#FFF1F1] px-2.5 py-0.5 text-[11px] font-semibold text-[#E02424]">
                                                                                        Baru
                                                                                    </span>
                                                                                )}
                                                                                {isProcessing && (
                                                                                    <span className="inline-block rounded-full border border-[#FDE68A]/60 bg-[#FEF7EC] px-2.5 py-0.5 text-[11px] font-semibold text-[#D97706]">
                                                                                        Sedang
                                                                                        Diracik
                                                                                    </span>
                                                                                )}
                                                                                {isReady && (
                                                                                    <span className="inline-block rounded-full border border-[#A7F3D0]/60 bg-[#ECFDF5] px-2.5 py-0.5 text-[11px] font-semibold text-[#059669]">
                                                                                        Siap
                                                                                        Disajikan
                                                                                    </span>
                                                                                )}
                                                                                {isCompleted && (
                                                                                    <span className="inline-block rounded-full border border-neutral-200 bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-600">
                                                                                        Selesai
                                                                                    </span>
                                                                                )}
                                                                                {order.order_status ===
                                                                                    'cancelled' && (
                                                                                    <span className="inline-block rounded-full border border-red-200 bg-red-100 px-2.5 py-0.5 text-[11px] font-semibold text-red-800">
                                                                                        Batal
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div>
                                                                                {order.payment_status ===
                                                                                'paid' ? (
                                                                                    <span
                                                                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                                                            order.payment_method ===
                                                                                            'qris'
                                                                                                ? 'border border-blue-200 bg-blue-50 text-blue-700'
                                                                                                : 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                                                                        }`}
                                                                                    >
                                                                                        {order.payment_method ===
                                                                                        'qris' ? (
                                                                                            <QrCode className="size-2.5" />
                                                                                        ) : (
                                                                                            <Banknote className="size-2.5" />
                                                                                        )}
                                                                                        <span>
                                                                                            {order.payment_method ===
                                                                                            'qris'
                                                                                                ? 'QRIS • Lunas'
                                                                                                : 'Tunai • Lunas'}
                                                                                        </span>
                                                                                    </span>
                                                                                ) : (
                                                                                    <span
                                                                                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                                                            order.payment_method ===
                                                                                            'qris'
                                                                                                ? 'border border-amber-300 bg-amber-50 text-amber-800'
                                                                                                : 'border border-rose-200 bg-rose-50 text-rose-700'
                                                                                        }`}
                                                                                    >
                                                                                        {order.payment_method ===
                                                                                        'qris' ? (
                                                                                            <QrCode className="size-2.5 text-amber-600" />
                                                                                        ) : (
                                                                                            <Banknote className="size-2.5 text-rose-600" />
                                                                                        )}
                                                                                        <span>
                                                                                            {order.payment_method ===
                                                                                            'qris'
                                                                                                ? 'Menunggu QRIS'
                                                                                                : 'Belum Bayar (Kasir)'}
                                                                                        </span>
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </td>

                                                                    {/* 8. Aksi */}
                                                                    <td className="px-4 py-3 text-right">
                                                                        <div className="flex items-center justify-end gap-2.5">
                                                                            {/* CHECKBOX KONFIRMASI: Pesanan Done Diterima */}
                                                                            <label
                                                                                title="Ceklis jika pesanan done diterima"
                                                                                className="group/check flex cursor-pointer items-center gap-1.5 select-none"
                                                                            >
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={
                                                                                        isOrderAccepted
                                                                                    }
                                                                                    onChange={() =>
                                                                                        handleToggleOrderAccepted(
                                                                                            order,
                                                                                        )
                                                                                    }
                                                                                    className="size-4.5 cursor-pointer rounded border-neutral-300 text-emerald-600 accent-emerald-600 transition-all focus:ring-emerald-500"
                                                                                />
                                                                                <span
                                                                                    className={`text-[11px] font-semibold transition-colors ${
                                                                                        isOrderAccepted
                                                                                            ? 'font-bold text-emerald-700'
                                                                                            : 'text-neutral-400 group-hover/check:text-neutral-700'
                                                                                    }`}
                                                                                >
                                                                                    {isOrderAccepted
                                                                                        ? 'Diterima'
                                                                                        : 'Terima'}
                                                                                </span>
                                                                            </label>

                                                                            {/* TOMBOL AKSI: Ceklis -> Konfirmasi -> Pembayaran -> Siap Saji -> Selesaikan -> Cetak Struk */}
                                                                            {isCompleted ? (
                                                                                <Button
                                                                                    type="button"
                                                                                    onClick={() =>
                                                                                        openReceiptModal(
                                                                                            order,
                                                                                        )
                                                                                    }
                                                                                    className="flex h-auto items-center gap-1.5 rounded-full border border-neutral-300 bg-white px-4 py-1.5 text-xs font-bold text-neutral-700 shadow-xs transition-all hover:bg-neutral-50 active:scale-98"
                                                                                >
                                                                                    <Printer className="size-3.5 text-neutral-600" />
                                                                                    <span>
                                                                                        Cetak
                                                                                        Struk
                                                                                    </span>
                                                                                </Button>
                                                                            ) : (
                                                                                <Button
                                                                                    type="button"
                                                                                    disabled={
                                                                                        !!processingOrderIds[
                                                                                            order
                                                                                                .id
                                                                                        ]
                                                                                    }
                                                                                    onClick={() =>
                                                                                        handleKonfirmasiClick(
                                                                                            order,
                                                                                        )
                                                                                    }
                                                                                    className={`flex h-auto items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-bold shadow-xs transition-all ${
                                                                                        processingOrderIds[
                                                                                            order
                                                                                                .id
                                                                                        ]
                                                                                            ? 'cursor-wait opacity-70'
                                                                                            : 'active:scale-98'
                                                                                    } ${
                                                                                        isPending
                                                                                            ? 'bg-[#C82A2A] text-white hover:bg-[#A92222]'
                                                                                            : isProcessing
                                                                                              ? 'bg-[#E89E28] text-white hover:bg-[#D48D1D]'
                                                                                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                                                                    }`}
                                                                                >
                                                                                    {processingOrderIds[
                                                                                        order
                                                                                            .id
                                                                                    ] ? (
                                                                                        <Loader2 className="size-3.5 animate-spin" />
                                                                                    ) : null}
                                                                                    <span>
                                                                                        {isPending
                                                                                            ? 'Konfirmasi'
                                                                                            : isProcessing
                                                                                              ? 'Tandai Siap Saji'
                                                                                              : 'Selesaikan Pesanan'}
                                                                                    </span>
                                                                                </Button>
                                                                            )}

                                                                            {/* Dropdown Options (⋮): Sederhana & Bersih */}
                                                                            <DropdownMenu>
                                                                                <DropdownMenuTrigger
                                                                                    asChild
                                                                                >
                                                                                    <button
                                                                                        type="button"
                                                                                        title="Menu Opsi"
                                                                                        className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                                                                                    >
                                                                                        <MoreVertical className="size-4" />
                                                                                    </button>
                                                                                </DropdownMenuTrigger>
                                                                                <DropdownMenuContent
                                                                                    align="end"
                                                                                    className="min-w-40 border-neutral-200 bg-white text-xs shadow-md"
                                                                                >
                                                                                    {order.payment_status !==
                                                                                        'paid' && (
                                                                                        <DropdownMenuItem
                                                                                            onClick={() =>
                                                                                                openPaymentModal(
                                                                                                    order,
                                                                                                )
                                                                                            }
                                                                                            className="flex cursor-pointer items-center gap-2 font-semibold text-emerald-700"
                                                                                        >
                                                                                            <DollarSign className="size-3.5 text-emerald-600" />
                                                                                            <span>
                                                                                                Bayar
                                                                                                Kasir
                                                                                            </span>
                                                                                        </DropdownMenuItem>
                                                                                    )}

                                                                                    <DropdownMenuItem
                                                                                        onClick={() =>
                                                                                            openReceiptModal(
                                                                                                order,
                                                                                            )
                                                                                        }
                                                                                        className="flex cursor-pointer items-center gap-2 font-medium"
                                                                                    >
                                                                                        <Printer className="size-3.5 text-neutral-600" />
                                                                                        <span>
                                                                                            Cetak
                                                                                            Struk
                                                                                            Kafe
                                                                                        </span>
                                                                                    </DropdownMenuItem>

                                                                                    {order.payment_status !==
                                                                                        'paid' &&
                                                                                        Number(
                                                                                            order.settled_amount ??
                                                                                                0,
                                                                                        ) <=
                                                                                            0 &&
                                                                                        order.order_status !==
                                                                                            'completed' &&
                                                                                        order.order_status !==
                                                                                            'cancelled' && (
                                                                                            <>
                                                                                                <DropdownMenuSeparator />

                                                                                                <DropdownMenuItem
                                                                                                    onClick={() =>
                                                                                                        openCancelModal(
                                                                                                            order,
                                                                                                        )
                                                                                                    }
                                                                                                    className="flex cursor-pointer items-center gap-2 font-medium text-red-600"
                                                                                                >
                                                                                                    <XCircle className="size-3.5 text-red-500" />
                                                                                                    <span>
                                                                                                        Batalkan
                                                                                                        Pesanan
                                                                                                    </span>
                                                                                                </DropdownMenuItem>
                                                                                            </>
                                                                                        )}
                                                                                </DropdownMenuContent>
                                                                            </DropdownMenu>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        },
                                                    )
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* KANBAN BOARD VIEW (Opsi Tambahan untuk Barista) */}
                            {currentView === 'kanban' && (
                                <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 md:grid-cols-3">
                                    {/* Column 1: Pesanan Baru */}
                                    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#E8DFC8] bg-[#FAF5E8] p-3 shadow-xs">
                                        <div className="flex flex-shrink-0 items-center justify-between px-1 pb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="size-2.5 rounded-full bg-[#C82A2A]" />
                                                <h3 className="text-sm font-bold text-neutral-900">
                                                    Pesanan Baru
                                                </h3>
                                                <span className="flex size-5 items-center justify-center rounded-full bg-[#C82A2A] text-[10px] font-bold text-white">
                                                    {countsLive.pending}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                                            {localOrders
                                                .filter(
                                                    (o) =>
                                                        o.order_status ===
                                                        'pending',
                                                )
                                                .map((o) => (
                                                    <div
                                                        key={o.id}
                                                        className="space-y-2 rounded-xl border border-[#E2D5BA] bg-white p-3 shadow-xs"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-black text-neutral-900">
                                                                Meja{' '}
                                                                {o.table
                                                                    ?.table_number ??
                                                                    '00'}
                                                            </span>
                                                            <span className="text-[10px] text-neutral-400">
                                                                #
                                                                {o.order_number}
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-neutral-700">
                                                            {o.items
                                                                .filter(
                                                                    (it) =>
                                                                        it.status !==
                                                                        'rejected',
                                                                )
                                                                .map((it) => (
                                                                    <div
                                                                        key={
                                                                            it.id
                                                                        }
                                                                    >
                                                                        {
                                                                            it.quantity
                                                                        }
                                                                        x{' '}
                                                                        {
                                                                            it.menu_name
                                                                        }
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            disabled={
                                                                !!processingOrderIds[
                                                                    o.id
                                                                ]
                                                            }
                                                            onClick={() =>
                                                                handleKonfirmasiClick(
                                                                    o,
                                                                )
                                                            }
                                                            className={`flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#C82A2A] py-1.5 text-xs font-bold text-white hover:bg-[#A92222] ${
                                                                processingOrderIds[
                                                                    o.id
                                                                ]
                                                                    ? 'cursor-wait opacity-70'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {processingOrderIds[
                                                                o.id
                                                            ] && (
                                                                <Loader2 className="size-3.5 animate-spin" />
                                                            )}
                                                            <span>
                                                                Konfirmasi
                                                                Pesanan
                                                            </span>
                                                        </Button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Column 2: Sedang Diracik */}
                                    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#E8DFC8] bg-[#FAF5E8] p-3 shadow-xs">
                                        <div className="flex flex-shrink-0 items-center justify-between px-1 pb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="size-2.5 rounded-full bg-amber-400" />
                                                <h3 className="text-sm font-bold text-neutral-900">
                                                    Sedang Diracik Barista
                                                </h3>
                                                <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                                                    {countsLive.processing}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                                            {localOrders
                                                .filter(
                                                    (o) =>
                                                        o.order_status ===
                                                        'processing',
                                                )
                                                .map((o) => (
                                                    <div
                                                        key={o.id}
                                                        className="space-y-2 rounded-xl border border-[#E2D5BA] bg-white p-3 shadow-xs"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-black text-neutral-900">
                                                                Meja{' '}
                                                                {o.table
                                                                    ?.table_number ??
                                                                    '00'}
                                                            </span>
                                                            <span className="text-xs font-bold text-neutral-800">
                                                                {formatRupiah(
                                                                    o.total_amount,
                                                                )}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-1 text-xs text-neutral-700">
                                                            {o.items
                                                                .filter(
                                                                    (it) =>
                                                                        it.status !==
                                                                        'rejected',
                                                                )
                                                                .map((it) => (
                                                                    <div
                                                                        key={
                                                                            it.id
                                                                        }
                                                                        onClick={() =>
                                                                            toggleItemCheck(
                                                                                it.id,
                                                                            )
                                                                        }
                                                                        className="flex cursor-pointer items-center gap-2"
                                                                    >
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={
                                                                                !!checkedItems[
                                                                                    it
                                                                                        .id
                                                                                ]
                                                                            }
                                                                            readOnly
                                                                            className="rounded"
                                                                        />
                                                                        <span
                                                                            className={
                                                                                checkedItems[
                                                                                    it
                                                                                        .id
                                                                                ]
                                                                                    ? 'text-neutral-400 line-through'
                                                                                    : ''
                                                                            }
                                                                        >
                                                                            {
                                                                                it.quantity
                                                                            }
                                                                            x{' '}
                                                                            {
                                                                                it.menu_name
                                                                            }
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            disabled={
                                                                !!processingOrderIds[
                                                                    o.id
                                                                ]
                                                            }
                                                            onClick={() =>
                                                                handleUpdateStatus(
                                                                    o,
                                                                    'ready',
                                                                )
                                                            }
                                                            className={`flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#E89E28] py-1.5 text-xs font-bold text-white hover:bg-[#D48D1D] ${
                                                                processingOrderIds[
                                                                    o.id
                                                                ]
                                                                    ? 'cursor-wait opacity-70'
                                                                    : ''
                                                            }`}
                                                        >
                                                            {processingOrderIds[
                                                                o.id
                                                            ] && (
                                                                <Loader2 className="size-3.5 animate-spin" />
                                                            )}
                                                            <span>
                                                                Tandai Siap Saji
                                                            </span>
                                                        </Button>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>

                                    {/* Column 3: Siap Disajikan */}
                                    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[#E8DFC8] bg-[#FAF5E8] p-3 shadow-xs">
                                        <div className="flex flex-shrink-0 items-center justify-between px-1 pb-3">
                                            <div className="flex items-center gap-2">
                                                <span className="size-2.5 rounded-full bg-emerald-500" />
                                                <h3 className="text-sm font-bold text-neutral-900">
                                                    Siap Saji ke Meja
                                                </h3>
                                                <span className="flex size-5 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                                                    {countsLive.ready}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                                            {localOrders
                                                .filter(
                                                    (o) =>
                                                        o.order_status ===
                                                        'ready',
                                                )
                                                .map((o) => (
                                                    <div
                                                        key={o.id}
                                                        className="space-y-2 rounded-xl border-2 border-emerald-500 bg-white p-3 shadow-xs"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-black text-neutral-900">
                                                                Meja{' '}
                                                                {o.table
                                                                    ?.table_number ??
                                                                    '00'}
                                                            </span>
                                                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                                                Siap Diantar
                                                            </span>
                                                        </div>
                                                        <div className="text-xs text-neutral-700">
                                                            {o.items
                                                                .filter(
                                                                    (it) =>
                                                                        it.status !==
                                                                        'rejected',
                                                                )
                                                                .map((it) => (
                                                                    <div
                                                                        key={
                                                                            it.id
                                                                        }
                                                                    >
                                                                        {
                                                                            it.quantity
                                                                        }
                                                                        x{' '}
                                                                        {
                                                                            it.menu_name
                                                                        }
                                                                    </div>
                                                                ))}
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    if (
                                                                        o.payment_status !==
                                                                        'paid'
                                                                    ) {
                                                                        openPaymentModal(
                                                                            o,
                                                                        );
                                                                    } else {
                                                                        handleUpdateStatus(
                                                                            o,
                                                                            'completed',
                                                                        );
                                                                    }
                                                                }}
                                                                className="flex-1 bg-emerald-600 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
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
                        <div className="flex min-h-0 flex-1 flex-col px-6 pt-2 pb-4">
                            <div className="flex items-center justify-between py-2">
                                <h3 className="text-sm font-bold text-neutral-900">
                                    Riwayat Pesanan Selesai (
                                    {countsLive.completed_today} Pesanan)
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
                            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#EFE7D8] bg-white shadow-xs">
                                <div className="flex-1 overflow-y-auto">
                                    <table className="w-full border-collapse text-left">
                                        <thead>
                                            <tr className="sticky top-0 z-10 border-b border-neutral-100 bg-white text-[11px] font-semibold text-neutral-400">
                                                <th className="px-4 py-3">
                                                    Order ID
                                                </th>
                                                <th className="px-4 py-3">
                                                    Meja / Tamu
                                                </th>
                                                <th className="px-4 py-3">
                                                    Menu Dipesan
                                                </th>
                                                <th className="px-4 py-3">
                                                    Total
                                                </th>
                                                <th className="px-4 py-3">
                                                    Metode Bayar
                                                </th>
                                                <th className="px-4 py-3">
                                                    Waktu Selesai
                                                </th>
                                                <th className="px-4 py-3 text-right">
                                                    Aksi
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-neutral-100 text-xs">
                                            {localOrders
                                                .filter(
                                                    (o) =>
                                                        o.order_status ===
                                                        'completed',
                                                )
                                                .map((o) => (
                                                    <tr
                                                        key={o.id}
                                                        className="hover:bg-neutral-50/70"
                                                    >
                                                        <td className="px-4 py-3 font-mono font-bold text-neutral-900">
                                                            #{o.order_number}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="font-bold text-neutral-900">
                                                                Meja{' '}
                                                                {o.table
                                                                    ?.table_number ??
                                                                    '00'}
                                                            </div>
                                                            <div className="text-[11px] text-neutral-500">
                                                                {
                                                                    o.customer_name
                                                                }
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="space-y-0.5">
                                                                {o.items
                                                                    .filter(
                                                                        (it) =>
                                                                            it.status !==
                                                                            'rejected',
                                                                    )
                                                                    .map(
                                                                        (
                                                                            it,
                                                                        ) => (
                                                                            <div
                                                                                key={
                                                                                    it.id
                                                                                }
                                                                            >
                                                                                {
                                                                                    it.quantity
                                                                                }
                                                                                x{' '}
                                                                                {
                                                                                    it.menu_name
                                                                                }
                                                                            </div>
                                                                        ),
                                                                    )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3 font-bold text-neutral-900">
                                                            {formatRupiah(
                                                                o.total_amount,
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <span
                                                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase ${
                                                                    o.payment_method ===
                                                                    'qris'
                                                                        ? 'border-blue-200 bg-blue-50 text-blue-800'
                                                                        : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                                                }`}
                                                            >
                                                                {o.payment_method ===
                                                                'qris' ? (
                                                                    <QrCode className="size-3" />
                                                                ) : (
                                                                    <Banknote className="size-3" />
                                                                )}
                                                                <span>
                                                                    {o.payment_method ===
                                                                    'qris'
                                                                        ? 'QRIS ONLINE (LUNAS)'
                                                                        : 'TUNAI KASIR (LUNAS)'}
                                                                </span>
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-[11px] text-neutral-500">
                                                            {formatDateTime(
                                                                o.updated_at ??
                                                                    o.created_at,
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3 text-right">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() =>
                                                                    openReceiptModal(
                                                                        o,
                                                                    )
                                                                }
                                                                className="flex items-center gap-1.5 text-xs"
                                                            >
                                                                <Printer className="size-3.5" />
                                                                <span>
                                                                    Cetak Struk
                                                                </span>
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

                    {/* VIEW: PEMBARUAN & DAFTAR MENU DARI ADMIN */}
                    {currentView === 'menu_info' &&
                        (() => {
                            const filteredMenuList = localAllMenus.filter(
                                (m) => {
                                    if (
                                        selectedMenuCategory !== 'all' &&
                                        m.category_id !== selectedMenuCategory
                                    ) {
                                        return false;
                                    }
                                    if (menuStatusFilter === 'promo') {
                                        if (
                                            !m.is_discount_active ||
                                            (m.discount_amount || 0) <= 0
                                        )
                                            return false;
                                    } else if (menuStatusFilter === 'active') {
                                        if (!isCashierMenuAvailable(m))
                                            return false;
                                    } else if (
                                        menuStatusFilter === 'inactive'
                                    ) {
                                        if (isCashierMenuAvailable(m))
                                            return false;
                                    }

                                    if (menuSearchQuery.trim()) {
                                        const q = menuSearchQuery.toLowerCase();
                                        const nameMatch = m.name
                                            .toLowerCase()
                                            .includes(q);
                                        const descMatch = (m.description || '')
                                            .toLowerCase()
                                            .includes(q);
                                        const catMatch = (
                                            m.category?.name || ''
                                        )
                                            .toLowerCase()
                                            .includes(q);
                                        return (
                                            nameMatch || descMatch || catMatch
                                        );
                                    }
                                    return true;
                                },
                            );

                            const sortedMenuList = [...filteredMenuList].sort(
                                (a, b) => {
                                    if (menuSortBy === 'newest') {
                                        const timeA = new Date(
                                            a.updated_at || a.created_at || 0,
                                        ).getTime();
                                        const timeB = new Date(
                                            b.updated_at || b.created_at || 0,
                                        ).getTime();
                                        return timeB - timeA;
                                    }
                                    if (menuSortBy === 'name') {
                                        return a.name.localeCompare(b.name);
                                    }
                                    if (menuSortBy === 'price_asc') {
                                        const pA =
                                            a.final_price ??
                                            parseFloat(a.base_price);
                                        const pB =
                                            b.final_price ??
                                            parseFloat(b.base_price);
                                        return pA - pB;
                                    }
                                    if (menuSortBy === 'price_desc') {
                                        const pA =
                                            a.final_price ??
                                            parseFloat(a.base_price);
                                        const pB =
                                            b.final_price ??
                                            parseFloat(b.base_price);
                                        return pB - pA;
                                    }
                                    return 0;
                                },
                            );

                            const totalCount = localAllMenus.length;
                            const activeCount = localAllMenus.filter((m) =>
                                isCashierMenuAvailable(m),
                            ).length;
                            const promoCount = localAllMenus.filter(
                                (m) =>
                                    m.is_discount_active &&
                                    (m.discount_amount || 0) > 0,
                            ).length;
                            const inactiveCount = totalCount - activeCount;

                            return (
                                <div className="flex min-h-0 flex-1 flex-col px-4 pt-2 pb-4 lg:px-6">
                                    {/* Top Banner Info Sinkronisasi dari Admin */}
                                    <div className="flex flex-shrink-0 flex-col items-start justify-between gap-3 py-2 sm:flex-row sm:items-center">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex size-7 items-center justify-center rounded-lg bg-[#C82A2A] font-bold text-white shadow-2xs">
                                                    <Coffee className="size-4" />
                                                </div>
                                                <div>
                                                    <h3 className="text-sm leading-tight font-extrabold tracking-tight text-neutral-900 lg:text-base">
                                                        Pembaruan & Daftar Menu
                                                        dari Admin
                                                    </h3>
                                                    <p className="text-[11px] font-medium text-neutral-500">
                                                        Info menu baru,
                                                        perubahan harga, varian
                                                        ukuran/topping, dan
                                                        promo diskon yang
                                                        diinput oleh Admin
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() =>
                                                    setCurrentView('queue')
                                                }
                                                className="gap-1.5 border-[#DFCFA9] text-xs font-bold hover:bg-[#FAF5E8]"
                                            >
                                                <ArrowRight className="size-3.5 rotate-180 text-[#C82A2A]" />
                                                Kembali ke Antrean Kasir
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Stat Mini Banner Row */}
                                    <div className="my-2 grid flex-shrink-0 grid-cols-2 gap-2.5 sm:grid-cols-4">
                                        <div className="flex items-center justify-between rounded-xl border border-[#E8DFC8] bg-white p-2.5 shadow-2xs">
                                            <div>
                                                <span className="block text-[10px] font-bold tracking-wide text-neutral-500 uppercase">
                                                    Total Menu
                                                </span>
                                                <span className="text-base leading-tight font-black text-neutral-900">
                                                    {totalCount}
                                                </span>
                                            </div>
                                            <div className="flex size-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                                                <Layers className="size-4" />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-[#E8DFC8] bg-white p-2.5 shadow-2xs">
                                            <div>
                                                <span className="block text-[10px] font-bold tracking-wide text-emerald-600 uppercase">
                                                    Tersedia / Siap
                                                </span>
                                                <span className="text-base leading-tight font-black text-emerald-700">
                                                    {activeCount}
                                                </span>
                                            </div>
                                            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                                                <CheckCircle2 className="size-4" />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-[#F5C2C0] bg-white bg-gradient-to-br from-white to-[#FDECEB]/40 p-2.5 shadow-2xs">
                                            <div>
                                                <span className="block text-[10px] font-bold tracking-wide text-[#C82A2A] uppercase">
                                                    Sedang Promo
                                                </span>
                                                <span className="text-base leading-tight font-black text-[#C82A2A]">
                                                    {promoCount}
                                                </span>
                                            </div>
                                            <div className="flex size-7 items-center justify-center rounded-lg bg-[#FDECEB] text-[#C82A2A]">
                                                <Flame className="size-4" />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between rounded-xl border border-[#E8DFC8] bg-white p-2.5 shadow-2xs">
                                            <div>
                                                <span className="block text-[10px] font-bold tracking-wide text-neutral-400 uppercase">
                                                    Habis / Nonaktif
                                                </span>
                                                <span className="text-base leading-tight font-black text-neutral-500">
                                                    {inactiveCount}
                                                </span>
                                            </div>
                                            <div className="flex size-7 items-center justify-center rounded-lg bg-neutral-100 text-neutral-400">
                                                <XCircle className="size-4" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Filter Controls Bar */}
                                    <div className="flex flex-shrink-0 flex-col items-stretch justify-between gap-2 py-2 sm:flex-row sm:items-center">
                                        {/* Category Filter Pills */}
                                        <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setSelectedMenuCategory(
                                                        'all',
                                                    )
                                                }
                                                className={cn(
                                                    'shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold transition',
                                                    selectedMenuCategory ===
                                                        'all'
                                                        ? 'border-[#C82A2A] bg-[#C82A2A] text-white shadow-xs'
                                                        : 'border-[#E8DFC8] bg-white text-neutral-700 hover:bg-[#FAF5E8]',
                                                )}
                                            >
                                                Semua Kategori ({totalCount})
                                            </button>
                                            {localMenuCatalog.map((cat) => {
                                                const catCount =
                                                    localAllMenus.filter(
                                                        (m) =>
                                                            m.category_id ===
                                                            cat.id,
                                                    ).length;
                                                return (
                                                    <button
                                                        key={cat.id}
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedMenuCategory(
                                                                cat.id,
                                                            )
                                                        }
                                                        className={cn(
                                                            'shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold transition',
                                                            selectedMenuCategory ===
                                                                cat.id
                                                                ? 'border-[#C82A2A] bg-[#C82A2A] text-white shadow-xs'
                                                                : 'border-[#E8DFC8] bg-white text-neutral-700 hover:bg-[#FAF5E8]',
                                                        )}
                                                    >
                                                        {cat.name} ({catCount})
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Search & Status Filter */}
                                        <div className="flex shrink-0 items-center gap-2">
                                            <div className="relative w-44 sm:w-56">
                                                <Search className="absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-neutral-400" />
                                                <input
                                                    type="text"
                                                    value={menuSearchQuery}
                                                    onChange={(e) =>
                                                        setMenuSearchQuery(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="Cari menu dari admin..."
                                                    className="h-8 w-full rounded-xl border border-[#E8DFC8] bg-white pr-7 pl-7 text-xs text-neutral-800 shadow-2xs placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none"
                                                />
                                                {menuSearchQuery && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setMenuSearchQuery(
                                                                '',
                                                            )
                                                        }
                                                        className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer text-neutral-400 hover:text-neutral-700"
                                                    >
                                                        <X className="size-3" />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="relative shrink-0">
                                                <select
                                                    value={menuSortBy}
                                                    onChange={(e) =>
                                                        setMenuSortBy(
                                                            e.target
                                                                .value as any,
                                                        )
                                                    }
                                                    className="h-8 cursor-pointer appearance-none rounded-xl border border-[#E8DFC8] bg-white pr-7 pl-2.5 text-[11px] font-bold text-neutral-800 shadow-2xs focus:border-neutral-500 focus:outline-none"
                                                >
                                                    <option value="newest">
                                                        🕒 Terbaru Diupdate
                                                        Admin
                                                    </option>
                                                    <option value="name">
                                                        🔤 Nama A - Z
                                                    </option>
                                                    <option value="price_asc">
                                                        💵 Harga Terendah
                                                    </option>
                                                    <option value="price_desc">
                                                        💎 Harga Tertinggi
                                                    </option>
                                                </select>
                                                <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-neutral-400" />
                                            </div>

                                            <div className="flex items-center gap-1 rounded-xl border border-[#E8DFC8] bg-[#F3ECE0] p-1">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setMenuStatusFilter(
                                                            'all',
                                                        )
                                                    }
                                                    className={cn(
                                                        'cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition',
                                                        menuStatusFilter ===
                                                            'all'
                                                            ? 'bg-white text-neutral-900 shadow-xs'
                                                            : 'text-neutral-600 hover:text-neutral-900',
                                                    )}
                                                >
                                                    Semua
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setMenuStatusFilter(
                                                            'promo',
                                                        )
                                                    }
                                                    className={cn(
                                                        'flex cursor-pointer items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition',
                                                        menuStatusFilter ===
                                                            'promo'
                                                            ? 'bg-[#C82A2A] text-white shadow-xs'
                                                            : 'text-[#C82A2A] hover:bg-white/60',
                                                    )}
                                                >
                                                    <Flame className="size-3" />
                                                    Promo ({promoCount})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setMenuStatusFilter(
                                                            'active',
                                                        )
                                                    }
                                                    className={cn(
                                                        'cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition',
                                                        menuStatusFilter ===
                                                            'active'
                                                            ? 'bg-emerald-600 text-white shadow-xs'
                                                            : 'text-emerald-700 hover:bg-white/60',
                                                    )}
                                                >
                                                    Ready
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setMenuStatusFilter(
                                                            'inactive',
                                                        )
                                                    }
                                                    className={cn(
                                                        'cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-bold transition',
                                                        menuStatusFilter ===
                                                            'inactive'
                                                            ? 'bg-neutral-700 text-white shadow-xs'
                                                            : 'text-neutral-600 hover:text-neutral-900',
                                                    )}
                                                >
                                                    Habis
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Menu Catalog Grid */}
                                    <div className="min-h-0 flex-1 overflow-y-auto pt-1 pr-1">
                                        {sortedMenuList.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[#E8DFC8] bg-white p-12 text-center">
                                                <Coffee className="size-10 stroke-[1.5] text-neutral-300" />
                                                <h4 className="text-sm font-bold text-neutral-800">
                                                    Tidak Ada Menu Ditemukan
                                                </h4>
                                                <p className="max-w-sm text-xs text-neutral-500">
                                                    Tidak ada menu yang sesuai
                                                    dengan filter pencarian atau
                                                    status saat ini.
                                                </p>
                                                {(menuSearchQuery ||
                                                    selectedMenuCategory !==
                                                        'all' ||
                                                    menuStatusFilter !==
                                                        'all') && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => {
                                                            setMenuSearchQuery(
                                                                '',
                                                            );
                                                            setSelectedMenuCategory(
                                                                'all',
                                                            );
                                                            setMenuStatusFilter(
                                                                'all',
                                                            );
                                                        }}
                                                        className="mt-2 text-xs font-bold"
                                                    >
                                                        Reset Semua Filter
                                                    </Button>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 gap-3.5 pb-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                                                {sortedMenuList.map((menu) => {
                                                    const hasDiscount = Boolean(
                                                        menu.is_discount_active &&
                                                        (menu.discount_amount ||
                                                            0) > 0,
                                                    );
                                                    const isRecentlyUpdated =
                                                        recentlyUpdatedMenus.some(
                                                            (r) =>
                                                                r.id ===
                                                                menu.id,
                                                        );

                                                    return (
                                                        <div
                                                            key={menu.id}
                                                            onClick={() =>
                                                                setInspectingMenu(
                                                                    menu,
                                                                )
                                                            }
                                                            className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-[#E8DFC8] bg-white shadow-xs transition-all hover:border-[#C82A2A]/40 hover:shadow-md"
                                                        >
                                                            {/* Foto Menu */}
                                                            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#FAF5E8]">
                                                                {menu.image_path ? (
                                                                    <img
                                                                        src={`/storage/${menu.image_path}`}
                                                                        alt={
                                                                            menu.name
                                                                        }
                                                                        className={cn(
                                                                            'size-full object-cover transition-transform duration-300 group-hover:scale-105',
                                                                            !isCashierMenuAvailable(
                                                                                menu,
                                                                            ) &&
                                                                                'grayscale-[60%]',
                                                                        )}
                                                                    />
                                                                ) : (
                                                                    <div className="flex size-full flex-col items-center justify-center gap-1 text-[#B8A67E]">
                                                                        <ImageIcon className="size-8 stroke-[1.5]" />
                                                                        <span className="text-[10px] font-semibold">
                                                                            Belum
                                                                            ada
                                                                            foto
                                                                        </span>
                                                                    </div>
                                                                )}

                                                                {/* Category Pill Top Left */}
                                                                <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
                                                                    <span className="rounded-full border border-[#E8DFC8] bg-white/95 px-2 py-0.5 text-[10px] font-bold text-neutral-800 shadow-2xs backdrop-blur-xs">
                                                                        {menu
                                                                            .category
                                                                            ?.name ||
                                                                            'Tanpa Kategori'}
                                                                    </span>
                                                                    {isRecentlyUpdated && (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-2 py-0.5 text-[9.5px] font-black text-white shadow-xs">
                                                                            <Sparkles className="size-2.5 shrink-0 fill-white text-white" />
                                                                            Baru
                                                                            Diupdate
                                                                        </span>
                                                                    )}
                                                                    {hasDiscount && (
                                                                        <span className="inline-flex items-center gap-1 rounded-full border border-[#C52828]/20 bg-[#C52828] px-2 py-0.5 text-[9.5px] font-extrabold text-white shadow-xs">
                                                                            <Flame className="size-2.5 shrink-0 fill-white text-white" />
                                                                            {menu.discount_type ===
                                                                            'percent'
                                                                                ? `Diskon ${parseFloat(String(menu.discount_value))}%`
                                                                                : `Diskon ${formatRupiah(menu.discount_value || 0)}`}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Status Ready / Habis Top Right */}
                                                                <div className="absolute top-2.5 right-2.5">
                                                                    {isCashierMenuAvailable(
                                                                        menu,
                                                                    ) ? (
                                                                        <span className="flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs">
                                                                            <span className="size-1.5 animate-pulse rounded-full bg-white" />
                                                                            {menu.is_limited_stock
                                                                                ? `Stok: ${menu.stock_quantity ?? 0}`
                                                                                : 'Tersedia'}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white shadow-2xs">
                                                                            <span className="size-1.5 rounded-full bg-white" />
                                                                            {menu.is_active &&
                                                                            menu.is_limited_stock
                                                                                ? 'Stok Habis'
                                                                                : 'Habis'}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Detail Konten */}
                                                            <div className="flex flex-1 flex-col justify-between gap-2.5 p-3.5">
                                                                <div>
                                                                    <h4 className="line-clamp-1 text-sm font-bold text-neutral-900 transition-colors group-hover:text-[#C82A2A]">
                                                                        {
                                                                            menu.name
                                                                        }
                                                                    </h4>
                                                                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-neutral-500">
                                                                        {menu.description ||
                                                                            'Tidak ada deskripsi dari admin.'}
                                                                    </p>

                                                                    {/* Varian Opsi Preview */}
                                                                    {menu.option_groups &&
                                                                        menu
                                                                            .option_groups
                                                                            .length >
                                                                            0 && (
                                                                            <div className="mt-2 flex flex-wrap gap-1 border-t border-neutral-100 pt-2">
                                                                                {menu.option_groups
                                                                                    .flatMap(
                                                                                        (
                                                                                            g,
                                                                                        ) =>
                                                                                            g.option_items,
                                                                                    )
                                                                                    .slice(
                                                                                        0,
                                                                                        3,
                                                                                    )
                                                                                    .map(
                                                                                        (
                                                                                            opt,
                                                                                        ) => (
                                                                                            <span
                                                                                                key={
                                                                                                    opt.id
                                                                                                }
                                                                                                className="rounded-md border border-[#E8DFC8] bg-[#FAF6EC] px-1.5 py-0.5 text-[10px] font-medium text-neutral-700"
                                                                                            >
                                                                                                {
                                                                                                    opt.name
                                                                                                }
                                                                                                {parseFloat(
                                                                                                    String(
                                                                                                        opt.additional_price,
                                                                                                    ),
                                                                                                ) >
                                                                                                    0 && (
                                                                                                    <span className="ml-0.5 font-bold text-[#C82A2A]">
                                                                                                        +
                                                                                                        {formatRupiah(
                                                                                                            opt.additional_price,
                                                                                                        )}
                                                                                                    </span>
                                                                                                )}
                                                                                            </span>
                                                                                        ),
                                                                                    )}
                                                                                {menu.option_groups.flatMap(
                                                                                    (
                                                                                        g,
                                                                                    ) =>
                                                                                        g.option_items,
                                                                                )
                                                                                    .length >
                                                                                    3 && (
                                                                                    <span className="rounded-md bg-neutral-100 px-1 py-0.5 text-[9px] font-bold text-neutral-500">
                                                                                        +
                                                                                        {menu.option_groups.flatMap(
                                                                                            (
                                                                                                g,
                                                                                            ) =>
                                                                                                g.option_items,
                                                                                        )
                                                                                            .length -
                                                                                            3}{' '}
                                                                                        lagi
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        )}
                                                                </div>

                                                                {/* Baris Harga & Aksi Detail */}
                                                                <div className="flex items-center justify-between gap-1 border-t border-neutral-100 pt-2">
                                                                    <div>
                                                                        <span className="block text-[9px] leading-none font-bold tracking-wider text-neutral-400 uppercase">
                                                                            Harga
                                                                            Jual
                                                                        </span>
                                                                        {hasDiscount ? (
                                                                            <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                                                                                <span className="text-sm font-black text-[#C82A2A] tabular-nums">
                                                                                    {formatRupiah(
                                                                                        menu.final_price ??
                                                                                            menu.base_price,
                                                                                    )}
                                                                                </span>
                                                                                <s className="text-[10px] leading-none text-neutral-400">
                                                                                    {formatRupiah(
                                                                                        menu.base_price,
                                                                                    )}
                                                                                </s>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="mt-0.5 block text-sm font-black text-[#C82A2A] tabular-nums">
                                                                                {formatRupiah(
                                                                                    menu.base_price,
                                                                                )}
                                                                            </span>
                                                                        )}
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={(
                                                                            e,
                                                                        ) => {
                                                                            e.stopPropagation();
                                                                            setInspectingMenu(
                                                                                menu,
                                                                            );
                                                                        }}
                                                                        className="flex size-7 cursor-pointer items-center justify-center rounded-lg border border-[#E8DFC8] bg-[#FAF6EC] text-neutral-700 transition hover:bg-[#F3ECE0]"
                                                                        title="Klik untuk lihat info detail varian"
                                                                    >
                                                                        <Eye className="size-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                </main>
            </div>

            {/* ========================================================================= */}
            {/* MODAL DETAIL INFORMASI MENU TER-UPDATE DARI ADMIN */}
            {/* ========================================================================= */}
            <Dialog
                open={inspectingMenu !== null}
                onOpenChange={(open) => !open && setInspectingMenu(null)}
            >
                <DialogContent className="max-w-lg overflow-hidden border-[#EFE7D8] bg-white p-0 text-neutral-900">
                    {inspectingMenu && (
                        <div>
                            {/* Header Image */}
                            <div className="relative aspect-[16/9] w-full overflow-hidden bg-[#FAF5E8]">
                                {inspectingMenu.image_path ? (
                                    <img
                                        src={`/storage/${inspectingMenu.image_path}`}
                                        alt={inspectingMenu.name}
                                        className="size-full object-cover"
                                    />
                                ) : (
                                    <div className="flex size-full flex-col items-center justify-center gap-1 text-[#B8A67E]">
                                        <ImageIcon className="size-10 stroke-[1.5]" />
                                        <span className="text-xs font-semibold">
                                            Belum ada foto produk
                                        </span>
                                    </div>
                                )}
                                <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                                    <span className="rounded-full border border-[#E8DFC8] bg-white/95 px-2.5 py-0.5 text-xs font-bold text-neutral-900 shadow-2xs backdrop-blur-xs">
                                        {inspectingMenu.category?.name ||
                                            'Kategori'}
                                    </span>
                                    {isCashierMenuAvailable(inspectingMenu) ? (
                                        <span className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-2xs">
                                            {inspectingMenu.is_limited_stock
                                                ? `Tersedia (Stok: ${inspectingMenu.stock_quantity ?? 0} porsi)`
                                                : 'Tersedia (Ready)'}
                                        </span>
                                    ) : (
                                        <span className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white shadow-2xs">
                                            {inspectingMenu.is_active &&
                                            inspectingMenu.is_limited_stock
                                                ? 'Stok Habis'
                                                : 'Habis / Nonaktif'}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Content Body */}
                            <div className="max-h-[60vh] space-y-4 overflow-y-auto p-5">
                                <DialogHeader className="space-y-1 text-left">
                                    <DialogTitle className="text-lg font-extrabold text-neutral-900">
                                        {inspectingMenu.name}
                                    </DialogTitle>
                                    <DialogDescription className="text-xs leading-relaxed text-neutral-600">
                                        {inspectingMenu.description ||
                                            'Tidak ada deskripsi tambahan dari Admin.'}
                                    </DialogDescription>
                                </DialogHeader>

                                {/* Informasi Diskon & Harga dari Admin */}
                                <div className="space-y-2 rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] p-3.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold tracking-wide text-neutral-700 uppercase">
                                            Informasi Harga & Promo dari Admin
                                        </span>
                                        {inspectingMenu.is_discount_active &&
                                        (inspectingMenu.discount_amount || 0) >
                                            0 ? (
                                            <span className="flex items-center gap-1 rounded-full bg-[#C82A2A] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-2xs">
                                                <Flame className="size-3 fill-white text-white" />
                                                Promo Aktif
                                            </span>
                                        ) : (
                                            <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-bold text-neutral-700">
                                                Harga Normal
                                            </span>
                                        )}
                                    </div>

                                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                                        <div className="rounded-lg border border-[#E8DFC8] bg-white p-2.5">
                                            <span className="block text-[10px] font-semibold text-neutral-500 uppercase">
                                                Harga Dasar Admin
                                            </span>
                                            <span className="text-sm font-bold text-neutral-800">
                                                {formatRupiah(
                                                    inspectingMenu.base_price,
                                                )}
                                            </span>
                                        </div>
                                        <div className="rounded-lg border border-[#E8DFC8] bg-white p-2.5">
                                            <span className="block text-[10px] font-semibold text-neutral-500 uppercase">
                                                Harga Jual (Final)
                                            </span>
                                            <span className="text-sm font-black text-[#C82A2A]">
                                                {formatRupiah(
                                                    inspectingMenu.final_price ??
                                                        inspectingMenu.base_price,
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    {inspectingMenu.is_discount_active &&
                                        (inspectingMenu.discount_amount || 0) >
                                            0 && (
                                            <div className="flex items-center justify-between rounded-lg bg-[#DCFCE7] p-2 text-xs font-semibold text-emerald-800">
                                                <span>
                                                    Potongan:{' '}
                                                    {inspectingMenu.discount_type ===
                                                    'percent'
                                                        ? `${parseFloat(String(inspectingMenu.discount_value))}%`
                                                        : formatRupiah(
                                                              inspectingMenu.discount_value ||
                                                                  0,
                                                          )}
                                                </span>
                                                <span className="font-bold">
                                                    Pelanggan Hemat{' '}
                                                    {formatRupiah(
                                                        inspectingMenu.discount_amount ||
                                                            0,
                                                    )}
                                                </span>
                                            </div>
                                        )}
                                </div>

                                {/* Grup Opsi & Varian Ukuran/Topping */}
                                {inspectingMenu.option_groups &&
                                inspectingMenu.option_groups.length > 0 ? (
                                    <div className="space-y-3">
                                        <h5 className="text-xs font-bold tracking-wide text-neutral-800 uppercase">
                                            Varian Opsi & Topping (
                                            {
                                                inspectingMenu.option_groups
                                                    .length
                                            }{' '}
                                            Grup)
                                        </h5>
                                        <div className="space-y-2">
                                            {inspectingMenu.option_groups.map(
                                                (group) => (
                                                    <div
                                                        key={group.id}
                                                        className="space-y-1.5 rounded-xl border border-neutral-200 bg-neutral-50/50 p-3"
                                                    >
                                                        <div className="flex items-center justify-between text-xs font-bold text-neutral-800">
                                                            <span>
                                                                {group.name}
                                                            </span>
                                                            <span className="text-[10px] font-medium text-neutral-500">
                                                                {group.selection_type ===
                                                                'single'
                                                                    ? 'Pilih Satu'
                                                                    : 'Bisa Banyak'}
                                                                {group.is_required &&
                                                                    ' • Wajib'}
                                                            </span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                                                            {group.option_items.map(
                                                                (opt) => (
                                                                    <div
                                                                        key={
                                                                            opt.id
                                                                        }
                                                                        className="flex items-center justify-between rounded-lg border border-neutral-200 bg-white p-2 text-xs"
                                                                    >
                                                                        <span className="font-medium text-neutral-800">
                                                                            {
                                                                                opt.name
                                                                            }
                                                                        </span>
                                                                        <span className="text-[11px] font-bold text-[#C82A2A]">
                                                                            {parseFloat(
                                                                                String(
                                                                                    opt.additional_price,
                                                                                ),
                                                                            ) >
                                                                            0
                                                                                ? `+${formatRupiah(opt.additional_price)}`
                                                                                : 'Gratis'}
                                                                        </span>
                                                                    </div>
                                                                ),
                                                            )}
                                                        </div>
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-xs text-neutral-400 italic">
                                        Menu ini tidak memiliki opsi ukuran atau
                                        topping tambahan.
                                    </div>
                                )}

                                {inspectingMenu.updated_at && (
                                    <div className="pt-1 text-right text-[11px] text-neutral-400">
                                        Sinkronisasi terakhir dari Admin:{' '}
                                        {formatDateTime(
                                            inspectingMenu.updated_at,
                                        )}
                                    </div>
                                )}
                            </div>

                            <DialogFooter className="border-t border-neutral-200/80 bg-neutral-50 p-4">
                                <Button
                                    type="button"
                                    onClick={() => setInspectingMenu(null)}
                                    className="w-full bg-[#C82A2A] text-xs font-bold text-white hover:bg-[#B02222]"
                                >
                                    Tutup Info Menu
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 1: KONFIRMASI PEMBAYARAN KASIR (ICON METODE BAYAR JELAS & RAPI) */}
            {/* ========================================================================= */}
            <Dialog
                open={isPaymentModalOpen}
                onOpenChange={setIsPaymentModalOpen}
            >
                <DialogContent className="max-w-md border-[#EFE7D8] bg-white p-6 text-neutral-900">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-neutral-900">
                            <span className="size-2.5 rounded-full bg-[#C82A2A]" />
                            <span>
                                Pembayaran #
                                {selectedOrderForPayment?.order_number}
                            </span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-500">
                            Meja{' '}
                            <strong className="text-neutral-800">
                                {selectedOrderForPayment?.table.table_number ??
                                    '00'}
                            </strong>{' '}
                            • Tamu:{' '}
                            <strong className="text-neutral-800">
                                {selectedOrderForPayment?.customer_name}
                            </strong>
                        </DialogDescription>
                    </DialogHeader>

                    {selectedOrderForPayment && (
                        <div className="space-y-4 py-2">
                            {/* Rincian Tagihan */}
                            <div className="flex items-center justify-between rounded-2xl border border-[#EFE7D8] bg-[#FAF7F0] p-4 shadow-2xs">
                                <div>
                                    <div className="text-[11px] font-semibold text-neutral-500">
                                        Total Tagihan:
                                    </div>
                                    <div className="text-xs text-neutral-400">
                                        {
                                            selectedOrderForPayment.items.filter(
                                                (i) => i.status !== 'rejected',
                                            ).length
                                        }{' '}
                                        menu pesanan
                                    </div>
                                </div>
                                <div className="text-xl font-black text-[#C82A2A]">
                                    {formatRupiah(
                                        getOrderAmountDue(
                                            selectedOrderForPayment,
                                        ),
                                    )}
                                </div>
                            </div>

                            {/* Metode Pembayaran: Tunai Saja di Kasir */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-neutral-700">
                                        Metode Pembayaran Kasir:
                                    </Label>
                                    <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-emerald-800 uppercase">
                                        Khusus Uang Tunai (Cash)
                                    </span>
                                </div>
                                <div className="flex items-center gap-3.5 rounded-2xl border-2 border-emerald-600 bg-emerald-50/70 p-3.5 text-emerald-950 shadow-2xs">
                                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-2xs">
                                        <Banknote className="size-6" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-black text-emerald-950">
                                                Uang Tunai (Cash)
                                            </span>
                                            <span className="rounded-md border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                                                Meja Kasir
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-[11px] leading-snug text-emerald-700">
                                            Kasir hanya menerima pembayaran uang
                                            tunai langsung. Pembayaran non-tunai
                                            (QRIS) dilakukan mandiri oleh
                                            pelanggan di web pemesanan.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Input Tunai Kasir */}
                            <div className="space-y-2.5 rounded-2xl border border-[#EFE7D8] bg-[#FAF7F0] p-3.5">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-bold text-neutral-800">
                                        Uang Tunai Diterima:
                                    </Label>
                                    <div className="flex gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setCashReceived(
                                                    String(
                                                        getOrderAmountDue(
                                                            selectedOrderForPayment,
                                                        ),
                                                    ),
                                                )
                                            }
                                            className="cursor-pointer rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-700 transition-colors hover:bg-neutral-100"
                                        >
                                            Uang Pas
                                        </button>
                                        {getOrderAmountDue(
                                            selectedOrderForPayment,
                                        ) <= 50000 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setCashReceived('50000')
                                                }
                                                className="cursor-pointer rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-700 transition-colors hover:bg-neutral-100"
                                            >
                                                50rb
                                            </button>
                                        )}
                                        {getOrderAmountDue(
                                            selectedOrderForPayment,
                                        ) <= 100000 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setCashReceived('100000')
                                                }
                                                className="cursor-pointer rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-700 transition-colors hover:bg-neutral-100"
                                            >
                                                100rb
                                            </button>
                                        )}
                                        {getOrderAmountDue(
                                            selectedOrderForPayment,
                                        ) <= 200000 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setCashReceived('200000')
                                                }
                                                className="cursor-pointer rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-700 transition-colors hover:bg-neutral-100"
                                            >
                                                200rb
                                            </button>
                                        )}
                                        {getOrderAmountDue(
                                            selectedOrderForPayment,
                                        ) <= 500000 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setCashReceived('500000')
                                                }
                                                className="cursor-pointer rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[10px] font-bold text-neutral-700 transition-colors hover:bg-neutral-100"
                                            >
                                                500rb
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="relative">
                                    <span className="absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold text-neutral-400">
                                        Rp
                                    </span>
                                    <Input
                                        type="number"
                                        placeholder={getOrderAmountDue(
                                            selectedOrderForPayment,
                                        ).toLocaleString('id-ID')}
                                        value={cashReceived}
                                        onChange={(e) =>
                                            setCashReceived(e.target.value)
                                        }
                                        className="border-neutral-200 bg-white pl-9 text-sm font-black text-neutral-900"
                                    />
                                </div>

                                {cashReceived && (
                                    <div className="flex items-center justify-between pt-1 text-xs font-bold">
                                        <span className="text-neutral-600">
                                            Kembalian:
                                        </span>
                                        <span
                                            className={
                                                parseFloat(cashReceived) >=
                                                getOrderAmountDue(
                                                    selectedOrderForPayment,
                                                )
                                                    ? 'text-sm font-black text-emerald-700'
                                                    : 'font-bold text-rose-600'
                                            }
                                        >
                                            {parseFloat(cashReceived) >=
                                            getOrderAmountDue(
                                                selectedOrderForPayment,
                                            )
                                                ? formatRupiah(
                                                      parseFloat(cashReceived) -
                                                          getOrderAmountDue(
                                                              selectedOrderForPayment,
                                                          ),
                                                  )
                                                : `Kurang ${formatRupiah(getOrderAmountDue(selectedOrderForPayment) - parseFloat(cashReceived))}`}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setIsPaymentModalOpen(false)}
                            className="border-neutral-200 bg-white text-xs font-semibold"
                        >
                            Batal
                        </Button>
                        <Button
                            onClick={handleConfirmPaymentSubmit}
                            className="flex items-center gap-1.5 bg-[#C82A2A] text-xs font-bold text-white shadow-xs hover:bg-[#A92222]"
                        >
                            <CheckCircle2 className="size-4" />
                            <span>Konfirmasi Bayar Tunai & Buka Struk</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 2: BATALKAN PESANAN (SEDERHANA & BERSIH TANPA TOLAK MENU) */}
            {/* ========================================================================= */}
            <Dialog
                open={isCancelModalOpen}
                onOpenChange={setIsCancelModalOpen}
            >
                <DialogContent className="max-w-md border-[#EFE7D8] bg-white p-6 text-neutral-900">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#C82A2A]">
                            <XCircle className="size-5" />
                            Batalkan Pesanan #
                            {selectedOrderForCancel?.order_number}?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-500">
                            Meja{' '}
                            {selectedOrderForCancel?.table.table_number ?? '00'}{' '}
                            • Tamu:{' '}
                            <strong className="text-neutral-800">
                                {selectedOrderForCancel?.customer_name}
                            </strong>
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2">
                        <Label className="text-xs font-bold text-neutral-700">
                            Alasan Pembatalan:
                        </Label>
                        <Input
                            placeholder="Contoh: Tamu membatalkan / Stok biji kopi habis"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            className="border-neutral-200 bg-white text-xs"
                        />
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {[
                                'Pelanggan Membatalkan',
                                'Stok Bahan Habis',
                                'Salah Input Meja',
                                'Pesanan Duplikat',
                            ].map((reason) => (
                                <button
                                    key={reason}
                                    type="button"
                                    onClick={() => setCancelReason(reason)}
                                    className="rounded-lg border border-neutral-200 bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700 transition-colors hover:bg-neutral-200"
                                >
                                    {reason}
                                </button>
                            ))}
                        </div>
                    </div>

                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setIsCancelModalOpen(false)}
                            className="border-neutral-200 bg-white text-xs"
                        >
                            Tutup
                        </Button>
                        <Button
                            onClick={handleCancelOrderSubmit}
                            className="bg-[#C82A2A] text-xs font-bold text-white hover:bg-red-800"
                        >
                            Ya, Batalkan Pesanan
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 3: CETAK STRUK THERMAL KAFE (MEMUAT RINCIAN ITEM LENGKAP) */}
            {/* ========================================================================= */}
            <Dialog
                open={isReceiptModalOpen}
                onOpenChange={setIsReceiptModalOpen}
            >
                <DialogContent className="printable-receipt max-w-xs border-[#EFE7D8] bg-white p-5 font-mono text-xs text-neutral-900 shadow-lg">
                    <DialogHeader className="space-y-1 text-center">
                        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-[#C82A2A] text-sm font-black text-white shadow-xs">
                            SL
                        </div>
                        <DialogTitle className="text-center text-base font-black text-neutral-900">
                            SIDE LINE CAFE
                        </DialogTitle>
                        <DialogDescription className="text-center font-sans text-[10px] tracking-widest text-neutral-500 uppercase">
                            Coffee & Eatery • Struk Resmi
                        </DialogDescription>
                    </DialogHeader>

                    {selectedOrderForReceipt && (
                        <div className="my-1 space-y-2.5 border-t border-b border-dashed border-neutral-300 py-2">
                            <div className="space-y-1 text-[11px]">
                                <div className="flex justify-between font-bold">
                                    <span>
                                        No: #
                                        {selectedOrderForReceipt.order_number}
                                    </span>
                                    <span className="rounded bg-neutral-100 px-2 py-0.5 text-[10px]">
                                        MEJA{' '}
                                        {selectedOrderForReceipt.table
                                            ?.table_number ?? '00'}
                                    </span>
                                </div>
                                <div className="flex justify-between text-[10px] text-neutral-500">
                                    <span>
                                        Tamu:{' '}
                                        {selectedOrderForReceipt.customer_name}
                                    </span>
                                    <span>
                                        {formatTimeOnly(
                                            selectedOrderForReceipt.created_at,
                                        )}{' '}
                                        WIB
                                    </span>
                                </div>
                                <div className="flex justify-between text-[10px] text-neutral-500">
                                    <span>Kasir: {staffName}</span>
                                    <span>
                                        {selectedOrderForReceipt.order_status ===
                                        'processing'
                                            ? 'Diracik Barista'
                                            : selectedOrderForReceipt.order_status ===
                                                'ready'
                                              ? 'Siap Disajikan'
                                              : 'Selesai'}
                                    </span>
                                </div>
                            </div>

                            <div className="my-2 border-t border-dashed border-neutral-300" />

                            {/* Detail Item Menu */}
                            <div className="space-y-2">
                                <div className="font-sans text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                                    Rincian Pesanan:
                                </div>
                                {selectedOrderForReceipt.items
                                    .filter((it) => it.status !== 'rejected')
                                    .map((item) => (
                                        <div
                                            key={item.id}
                                            className="space-y-0.5"
                                        >
                                            <div className="flex justify-between font-semibold">
                                                <span>
                                                    {item.quantity}x{' '}
                                                    {item.menu_name}
                                                </span>
                                                <span>
                                                    {formatRupiah(
                                                        item.total_price,
                                                    )}
                                                </span>
                                            </div>
                                            {item.options &&
                                                item.options.length > 0 && (
                                                    <div className="pl-3 text-[10px] text-neutral-500">
                                                        +{' '}
                                                        {item.options
                                                            .map(
                                                                (opt) =>
                                                                    opt.option_name,
                                                            )
                                                            .join(', ')}
                                                    </div>
                                                )}
                                            {item.customer_notes && (
                                                <div className="pl-3 text-[10px] text-amber-700 italic">
                                                    Catatan: "
                                                    {item.customer_notes}"
                                                </div>
                                            )}
                                        </div>
                                    ))}
                            </div>

                            <div className="my-2 border-t border-dashed border-neutral-300" />

                            {/* Ringkasan Pembayaran */}
                            <div className="space-y-1 text-[11px]">
                                <div className="flex justify-between text-neutral-600">
                                    <span>Subtotal</span>
                                    <span>
                                        {formatRupiah(
                                            selectedOrderForReceipt.subtotal,
                                        )}
                                    </span>
                                </div>
                                <div className="flex justify-between border-t border-dotted border-neutral-300 pt-1 text-sm font-black text-neutral-900">
                                    <span>TOTAL</span>
                                    <span>
                                        {formatRupiah(
                                            selectedOrderForReceipt.total_amount,
                                        )}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between pt-1 text-[11px]">
                                    <span className="text-neutral-600">
                                        Metode Bayar
                                    </span>
                                    <span
                                        className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-bold uppercase ${
                                            selectedOrderForReceipt.payment_method ===
                                            'qris'
                                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                        }`}
                                    >
                                        {selectedOrderForReceipt.payment_method ===
                                        'qris' ? (
                                            <QrCode className="size-3" />
                                        ) : (
                                            <Banknote className="size-3" />
                                        )}
                                        <span>
                                            {selectedOrderForReceipt.payment_method ===
                                            'qris'
                                                ? 'QRIS ONLINE (LUNAS)'
                                                : 'TUNAI KASIR (LUNAS)'}
                                        </span>
                                    </span>
                                </div>
                            </div>

                            <div className="my-2 border-t border-dashed border-neutral-300" />

                            <div className="space-y-0.5 text-center font-sans text-[10px] text-neutral-500">
                                <p className="font-semibold text-neutral-700">
                                    Terima Kasih atas Kunjungan Anda!
                                </p>
                                <p>
                                    Pesanan langsung diteruskan ke racik barista
                                    ☕
                                </p>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="no-print gap-2 font-sans sm:gap-0">
                        <Button
                            variant="outline"
                            onClick={() => setIsReceiptModalOpen(false)}
                            className="text-xs"
                        >
                            Tutup
                        </Button>
                        <Button
                            onClick={() => window.print()}
                            className="flex items-center gap-2 bg-[#C82A2A] text-xs font-bold text-white hover:bg-[#A92222]"
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
            <Dialog
                open={isLogoutModalOpen}
                onOpenChange={setIsLogoutModalOpen}
            >
                <DialogContent className="max-w-sm border-[#EFE7D8] bg-white text-neutral-900">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#C82A2A]">
                            <LogOut className="size-5" />
                            Keluar dari Shift Kasir?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-neutral-500">
                            Pastikan seluruh pesanan aktif telah
                            diserahterimakan ke staf kasir berikutnya.
                        </DialogDescription>
                    </DialogHeader>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsLogoutModalOpen(false)}
                            className="border-neutral-200 bg-white text-xs"
                        >
                            Batal
                        </Button>
                        <Button
                            onClick={() => router.post('/logout')}
                            className="bg-[#C82A2A] text-xs font-bold text-white hover:bg-red-800"
                        >
                            Ya, Keluar Shift
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
