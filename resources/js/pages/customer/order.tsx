import { Head, Link, router } from '@inertiajs/react';
import {
    ArrowClockwise,
    ArrowRight as PhArrowRight,
    Check,
    Coffee as PhCoffee,
    Flame,
    MagnifyingGlass,
    MapPin,
    Minus as PhMinus,
    Money,
    NotePencil,
    PencilSimpleLine,
    Plus as PhPlus,
    QrCode as PhQrCode,
    ShoppingBagOpen,
    ShoppingCart,
    SlidersHorizontal as PhSlidersHorizontal,
    Storefront,
    Trash,
    User as PhUser,
    WarningCircle,
    WifiHigh,
    X as PhX,
} from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
    CupHeaderPhosphorIcon,
    SizeOptionIcon,
} from '@/components/menu/size-icon';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface OptionItem {
    id: number;
    name: string;
    icon?: string | null;
    additional_price: string;
    is_default: boolean;
    is_active: boolean;
}

interface OptionGroup {
    id: number;
    name: string;
    selection_type: 'single' | 'multiple';
    is_required: boolean;
    option_items: OptionItem[];
}

interface Menu {
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
    is_stock_expired?: boolean;
    option_groups?: OptionGroup[];
}

interface StockSyncEntry {
    id: number;
    is_active: boolean;
    is_limited_stock: boolean;
    stock_quantity: number;
    is_stock_expired?: boolean;
}

interface LocationAccessInfo {
    required: boolean;
    verified: boolean;
    cafe_name: string;
    address: string | null;
    radius_meters: number;
    distance_meters: number | null;
    message: string | null;
}

interface VerifiedCoords {
    latitude: number;
    longitude: number;
}

interface Category {
    id: number;
    name: string;
    slug: string;
    menus: Menu[];
}

interface TableInfo {
    id: number;
    table_number: string;
    name: string | null;
    qr_token: string;
}

interface CartOption {
    group_name: string;
    option_name: string;
    additional_price: number;
    option_item_id: number;
}

interface CartItem {
    cart_id: string;
    menu_id: number;
    menu_name: string;
    base_price: number;
    unit_price: number;
    quantity: number;
    customer_notes: string;
    selected_options: CartOption[];
}

interface Props {
    table: TableInfo;
    categories: Category[];
    activeOrder?: {
        id: number;
        order_number: string;
        customer_name: string;
        order_status: 'pending' | 'processing';
        payment_status: 'unpaid' | 'paid';
        payment_method: string | null;
        subtotal: number;
        total_amount: number;
        settled_amount: number;
        unpaid_balance: number;
        notes: string | null;
        active_items_count: number;
        items: {
            id: number;
            menu_name: string;
            quantity: number;
            unit_price: number;
            total_price: number;
            customer_notes: string | null;
            options: {
                group_name: string;
                option_name: string;
                additional_price: number;
            }[];
        }[];
    } | null;
    lockedOrderNotice?: string | null;
    locationAccess?: LocationAccessInfo;
    orderingStatus?: {
        enabled: boolean;
        closed_message: string;
        cafe_name: string;
    };
    paymentPolicy?: {
        allow_cash: boolean;
        allow_xendit: boolean;
        expiry_minutes: number;
        default_method: 'qris' | 'cash';
    };
}

const VERIFIED_COORDS_STORAGE_KEY = 'sideorder_verified_coords';

function loadStoredCoords(): VerifiedCoords | null {
    if (typeof window === 'undefined') return null;

    try {
        const raw = sessionStorage.getItem(VERIFIED_COORDS_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
            typeof parsed?.latitude === 'number' &&
            typeof parsed?.longitude === 'number' &&
            Number.isFinite(parsed.latitude) &&
            Number.isFinite(parsed.longitude)
        ) {
            return {
                latitude: parsed.latitude,
                longitude: parsed.longitude,
            };
        }
        return null;
    } catch {
        return null;
    }
}

function saveStoredCoords(coords: VerifiedCoords): void {
    if (typeof window === 'undefined') return;

    try {
        sessionStorage.setItem(
            VERIFIED_COORDS_STORAGE_KEY,
            JSON.stringify(coords),
        );
    } catch {
        // Ignore storage quota errors
    }
}

function clearStoredCoords(): void {
    if (typeof window === 'undefined') return;

    try {
        sessionStorage.removeItem(VERIFIED_COORDS_STORAGE_KEY);
    } catch {
        // Ignore storage errors
    }
}

function loadLastOrderNumber(qrToken: string): string | null {
    if (typeof window === 'undefined') return null;

    try {
        const value = sessionStorage.getItem(`sideorder_last_order_${qrToken}`);
        return value && value.trim() !== '' ? value.trim() : null;
    } catch {
        return null;
    }
}

function isMenuOutOfStock(menu: Menu): boolean {
    return Boolean(
        menu.is_limited_stock &&
        (menu.is_stock_expired || (menu.stock_quantity ?? 0) <= 0),
    );
}

function isSingleSelectGroup(group: OptionGroup): boolean {
    return (
        group.selection_type === 'single' ||
        ['ukuran', 'size'].includes(group.name.trim().toLowerCase())
    );
}

function hasMenuVariants(menu: Menu): boolean {
    return Boolean(
        menu.option_groups &&
        menu.option_groups.some(
            (g) => g.option_items && g.option_items.length > 0,
        ),
    );
}

function uniqueOptionIds(ids: unknown[]): number[] {
    return Array.from(
        new Set(
            ids
                .map((id) => Number(id))
                .filter((id) => Number.isInteger(id) && id > 0),
        ),
    );
}

function buildCartId(
    menuId: number,
    optionIds: number[],
    notes: string,
): string {
    const sortedIds = uniqueOptionIds(optionIds).sort((a, b) => a - b);
    return `${menuId}-${sortedIds.join('_')}-${notes.trim()}`;
}

function hydrateCartFromStorage(
    qrToken: string,
    categories: Category[],
): CartItem[] {
    if (typeof window === 'undefined') {
        return [];
    }

    try {
        const raw = localStorage.getItem(`sideorder_cart_${qrToken}`);
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];

        const menuMap = new Map<number, Menu>();
        categories.forEach((cat) => {
            cat.menus.forEach((m) => {
                if (m.is_active && !isMenuOutOfStock(m)) {
                    menuMap.set(m.id, m);
                }
            });
        });

        const synced: CartItem[] = [];
        const allocatedPerMenu = new Map<number, number>();

        parsed.forEach((rawItem: any) => {
            const menu = menuMap.get(Number(rawItem?.menu_id));
            if (!menu) return;

            const requestedQty = Math.max(
                1,
                Math.min(50, Number(rawItem?.quantity) || 1),
            );
            const alreadyAllocated = allocatedPerMenu.get(menu.id) ?? 0;
            const remainingMenuStock = menu.is_limited_stock
                ? Math.max(0, (menu.stock_quantity ?? 0) - alreadyAllocated)
                : 50;
            const qty = Math.min(requestedQty, remainingMenuStock);
            if (qty <= 0) return;

            const notes =
                typeof rawItem?.customer_notes === 'string'
                    ? rawItem.customer_notes.trim()
                    : '';

            // Ambil ID opsi unik dari struktur baru (selected_options) maupun struktur lama (selected_option_ids)
            const rawOptionIds: number[] = Array.isArray(
                rawItem?.selected_options,
            )
                ? uniqueOptionIds(
                      rawItem.selected_options.map(
                          (o: any) => o?.option_item_id ?? o?.id,
                      ),
                  )
                : Array.isArray(rawItem?.selected_option_ids)
                  ? uniqueOptionIds(rawItem.selected_option_ids)
                  : [];

            const validOptions: CartOption[] = [];
            const seenOptionIds = new Set<number>();
            let optionsPrice = 0;

            if (menu.option_groups) {
                menu.option_groups.forEach((group) => {
                    const activeGroupItems = group.option_items.filter(
                        (opt) => opt.is_active,
                    );
                    const matchedInGroup = activeGroupItems.filter((opt) =>
                        rawOptionIds.includes(opt.id),
                    );

                    const chosenItems = isSingleSelectGroup(group)
                        ? matchedInGroup.slice(0, 1)
                        : matchedInGroup;

                    // Jika grup wajib belum terpilih pada data lama, pilih default/aktif pertama
                    if (
                        chosenItems.length === 0 &&
                        group.is_required &&
                        isSingleSelectGroup(group) &&
                        activeGroupItems.length > 0
                    ) {
                        const fallback =
                            activeGroupItems.find((i) => i.is_default) ||
                            activeGroupItems[0];
                        if (fallback) {
                            chosenItems.push(fallback);
                        }
                    }

                    chosenItems.forEach((opt) => {
                        if (seenOptionIds.has(opt.id)) return;
                        seenOptionIds.add(opt.id);
                        const addPrice = parseFloat(opt.additional_price) || 0;
                        optionsPrice += addPrice;
                        validOptions.push({
                            group_name: group.name,
                            option_name: opt.name,
                            additional_price: addPrice,
                            option_item_id: opt.id,
                        });
                    });
                });
            }

            const basePrice =
                parseFloat(String(menu.final_price ?? menu.base_price)) || 0;
            const unitPrice = basePrice + optionsPrice;
            const optionIds = validOptions.map((o) => o.option_item_id);
            const cartId = buildCartId(menu.id, optionIds, notes);

            const existingIdx = synced.findIndex((c) => c.cart_id === cartId);
            if (existingIdx > -1) {
                const addable = Math.min(
                    50 - synced[existingIdx].quantity,
                    qty,
                );
                synced[existingIdx].quantity += addable;
                allocatedPerMenu.set(menu.id, alreadyAllocated + addable);
            } else {
                synced.push({
                    cart_id: cartId,
                    menu_id: menu.id,
                    menu_name: menu.name,
                    base_price: basePrice,
                    unit_price: unitPrice,
                    quantity: qty,
                    customer_notes: notes,
                    selected_options: validOptions,
                });
                allocatedPerMenu.set(menu.id, alreadyAllocated + qty);
            }
        });

        return synced;
    } catch (e) {
        console.error(e);
        return [];
    }
}

// Fallback gambar estetis kafe sesuai kata kunci menu jika belum diunggah
function getMenuFallbackImage(name: string, categoryName: string): string {
    const lower = `${name} ${categoryName}`.toLowerCase();
    if (lower.includes('matcha') || lower.includes('green tea')) {
        return 'https://images.unsplash.com/photo-1536256263959-770b48d82b0a?q=80&w=400&auto=format&fit=crop';
    }
    if (
        lower.includes('croissant') ||
        lower.includes('pastry') ||
        lower.includes('roti') ||
        lower.includes('toast') ||
        lower.includes('bakar')
    ) {
        return 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=400&auto=format&fit=crop';
    }
    if (
        lower.includes('mie') ||
        lower.includes('nasi') ||
        lower.includes('makan') ||
        lower.includes('tahu') ||
        lower.includes('snack') ||
        lower.includes('goreng')
    ) {
        return 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=400&auto=format&fit=crop';
    }
    if (
        lower.includes('juice') ||
        lower.includes('jeruk') ||
        lower.includes('tea') ||
        lower.includes('segar')
    ) {
        return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=400&auto=format&fit=crop';
    }
    // Default: Kopi Susu / Coffee
    return 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=400&auto=format&fit=crop';
}

export default function CustomerOrder({
    table,
    categories,
    activeOrder = null,
    lockedOrderNotice = null,
    locationAccess = {
        required: false,
        verified: true,
        cafe_name: 'Café SIDE LINE',
        address: null,
        radius_meters: 100,
        distance_meters: null,
        message: null,
    },
    orderingStatus = {
        enabled: true,
        closed_message:
            'Pemesanan mandiri sedang ditutup sementara. Silakan hubungi kasir kami.',
        cafe_name: 'Café SIDE LINE',
    },
    paymentPolicy = {
        allow_cash: true,
        allow_xendit: true,
        expiry_minutes: 15,
        default_method: 'qris',
    },
}: Props) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>(
        'all',
    );

    // State Geolocation / Verifikasi Akses Area Kafe
    const [serverLocationVerified, setServerLocationVerified] =
        useState<boolean>(
            () => !locationAccess.required || locationAccess.verified,
        );
    const [locationGateStatus, setLocationGateStatus] = useState<
        'idle' | 'checking' | 'blocked'
    >(() =>
        locationAccess.required && !locationAccess.verified
            ? 'checking'
            : 'idle',
    );
    const [verifiedCoords, setVerifiedCoords] = useState<VerifiedCoords | null>(
        () => loadStoredCoords(),
    );
    const [lastOrderNumber] = useState<string | null>(() =>
        loadLastOrderNumber(table.qr_token),
    );
    const autoGeoTriggeredRef = useRef(false);

    // State sinkronisasi stok real-time ringan dari /order/stock-sync
    const [stockOverrides, setStockOverrides] = useState<
        Record<number, StockSyncEntry>
    >({});

    useEffect(() => {
        setServerLocationVerified(
            !locationAccess.required || locationAccess.verified,
        );
    }, [locationAccess.required, locationAccess.verified]);

    const isLocationBlocked =
        locationAccess.required && !serverLocationVerified;

    const verifyCoordinatesWithServer = useCallback(
        async (coords: VerifiedCoords, accuracy?: number | null) => {
            setLocationGateStatus('checking');
            const normalizedAccuracy =
                typeof accuracy === 'number' && Number.isFinite(accuracy)
                    ? Math.round(accuracy)
                    : null;

            const csrfToken = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content');

            try {
                const res = await fetch('/order/verify-location', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'X-CSRF-TOKEN': csrfToken || '',
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    credentials: 'same-origin',
                    body: JSON.stringify({
                        latitude: coords.latitude,
                        longitude: coords.longitude,
                        accuracy: normalizedAccuracy,
                    }),
                });

                const data = await res.json().catch(() => null);

                if (res.ok && data?.allowed) {
                    saveStoredCoords(coords);
                    setVerifiedCoords(coords);

                    router.reload({
                        only: [
                            'categories',
                            'activeOrder',
                            'lockedOrderNotice',
                            'locationAccess',
                        ],
                        onSuccess: () => {
                            setServerLocationVerified(true);
                            setLocationGateStatus('idle');
                        },
                        onError: () => {
                            setServerLocationVerified(false);
                            setLocationGateStatus('blocked');
                        },
                    });
                    return;
                }

                clearStoredCoords();
                setVerifiedCoords(null);
                setServerLocationVerified(false);
                setLocationGateStatus('blocked');
            } catch {
                setLocationGateStatus('blocked');
            }
        },
        [],
    );

    const requestCustomerLocation = useCallback(() => {
        if (
            typeof window !== 'undefined' &&
            (!window.isSecureContext ||
                typeof navigator === 'undefined' ||
                !navigator.geolocation)
        ) {
            setLocationGateStatus('blocked');
            return;
        }

        setLocationGateStatus('checking');

        const handleGeoError = (
            err: GeolocationPositionError,
            allowFallbackRetry: boolean,
        ) => {
            if (err.code === err.PERMISSION_DENIED) {
                setLocationGateStatus('blocked');
                return;
            }

            if (allowFallbackRetry) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        void verifyCoordinatesWithServer(
                            {
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude,
                            },
                            position.coords.accuracy,
                        );
                    },
                    (fallbackErr) => handleGeoError(fallbackErr, false),
                    {
                        enableHighAccuracy: false,
                        timeout: 10000,
                        maximumAge: 30000,
                    },
                );
                return;
            }

            setLocationGateStatus('blocked');
        };

        navigator.geolocation.getCurrentPosition(
            (position) => {
                void verifyCoordinatesWithServer(
                    {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    },
                    position.coords.accuracy,
                );
            },
            (err) => handleGeoError(err, true),
            {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0,
            },
        );
    }, [verifyCoordinatesWithServer]);

    // Jalankan verifikasi lokasi otomatis ketika gerbang geofencing terkunci
    useEffect(() => {
        if (!isLocationBlocked) {
            autoGeoTriggeredRef.current = false;
            return;
        }
        if (autoGeoTriggeredRef.current) return;
        autoGeoTriggeredRef.current = true;
        requestCustomerLocation();
    }, [isLocationBlocked, requestCustomerLocation]);

    // Gabungkan data menu server dengan pembaruan stok real-time
    const resolvedCategories = useMemo(() => {
        return categories
            .map((cat) => ({
                ...cat,
                menus: cat.menus
                    .map((menu) => {
                        const override = stockOverrides[menu.id];
                        if (!override) return menu;
                        return {
                            ...menu,
                            is_active: override.is_active,
                            is_limited_stock: override.is_limited_stock,
                            stock_quantity: override.stock_quantity,
                            is_stock_expired: override.is_stock_expired,
                        };
                    })
                    .filter((m) => m.is_active),
            }))
            .filter((cat) => cat.menus.length > 0);
    }, [categories, stockOverrides]);

    // Peta seluruh menu aktif berdasarkan ID untuk lookup cepat & sinkronisasi harga/stok
    const allMenusMap = useMemo(() => {
        const map = new Map<number, Menu>();
        resolvedCategories.forEach((cat) => {
            cat.menus.forEach((m) => {
                map.set(m.id, m);
            });
        });
        return map;
    }, [resolvedCategories]);

    // State Modal Kustomisasi / Edit Item
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const [activeMenu, setActiveMenu] = useState<Menu | null>(null);
    const [editingCartId, setEditingCartId] = useState<string | null>(null);
    const [customizeQty, setCustomizeQty] = useState(1);
    const [customizeNotes, setCustomizeNotes] = useState('');
    const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);

    // State Keranjang Belanja (lazy-initialized hanya saat akses lokasi lolos)
    const [cart, setCart] = useState<CartItem[]>(() =>
        isLocationBlocked
            ? []
            : hydrateCartFromStorage(table.qr_token, categories),
    );
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [customerName, setCustomerName] = useState(
        () => activeOrder?.customer_name || '',
    );
    const [orderNotes, setOrderNotes] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'qris' | 'cash'>(
        () =>
            paymentPolicy.default_method ??
            (!paymentPolicy.allow_xendit && paymentPolicy.allow_cash
                ? 'cash'
                : 'qris'),
    );
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (
            !paymentPolicy.allow_xendit &&
            paymentMethod === 'qris' &&
            paymentPolicy.allow_cash
        ) {
            setPaymentMethod('cash');
        } else if (
            !paymentPolicy.allow_cash &&
            paymentMethod === 'cash' &&
            paymentPolicy.allow_xendit
        ) {
            setPaymentMethod('qris');
        }
    }, [paymentPolicy.allow_xendit, paymentPolicy.allow_cash, paymentMethod]);

    // Ref guard untuk mencegah klik berulang (double-click / rapid tap)
    const quickAddLockRef = useRef<Record<number, number>>({});
    const modalSubmitLockRef = useRef<boolean>(false);
    const checkoutLockRef = useRef<boolean>(false);
    const idempotencyKeyRef = useRef<string>('');

    // Sinkronkan nama pemesan jika pesanan aktif tersedia
    useEffect(() => {
        if (activeOrder?.customer_name) {
            setCustomerName(activeOrder.customer_name);
        }
    }, [activeOrder?.customer_name]);

    // Polling ringan status pesanan aktif agar halaman menu tahu secara real-time jika pesanan sudah selesai
    useEffect(() => {
        if (!activeOrder || isLocationBlocked) return;

        const interval = setInterval(() => {
            router.reload({ only: ['activeOrder', 'lockedOrderNotice'] });
        }, 5000);

        return () => clearInterval(interval);
    }, [activeOrder?.order_number, isLocationBlocked]);

    const fetchStockSync = useCallback(async () => {
        try {
            const res = await fetch('/order/stock-sync', {
                headers: { Accept: 'application/json' },
                credentials: 'same-origin',
            });

            if (res.status === 403) {
                const payload = await res.json().catch(() => null);
                if (payload?.location_required) {
                    clearStoredCoords();
                    setVerifiedCoords(null);
                    setServerLocationVerified(false);
                    setLocationGateStatus('blocked');
                }
                return;
            }

            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data?.menus)) {
                const nextMap: Record<number, StockSyncEntry> = {};
                (data.menus as StockSyncEntry[]).forEach((entry) => {
                    nextMap[entry.id] = entry;
                });
                setStockOverrides(nextMap);
            }
        } catch {
            // Abaikan error jaringan sementara saat polling latar belakang
        }
    }, []);

    // Polling stok terbatas setiap 10 detik + saat tab kembali aktif
    useEffect(() => {
        if (isLocationBlocked) return;

        const interval = setInterval(() => {
            void fetchStockSync();
        }, 10000);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                void fetchStockSync();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [isLocationBlocked, fetchStockSync]);

    // Sinkronkan keranjang dari localStorage hanya ketika lokasi terverifikasi & katalog server siap
    useEffect(() => {
        if (isLocationBlocked || categories.length === 0) return;
        setCart(hydrateCartFromStorage(table.qr_token, categories));
    }, [table.qr_token, categories, isLocationBlocked]);

    // Sesuaikan keranjang bila polling stok terbaru menunjukkan penurunan sisa stok
    useEffect(() => {
        if (isLocationBlocked || Object.keys(stockOverrides).length === 0) {
            return;
        }

        setCart((prev) => {
            if (prev.length === 0) return prev;
            let changed = false;
            const allocated = new Map<number, number>();
            const next: CartItem[] = [];

            for (const item of prev) {
                const menu = allMenusMap.get(item.menu_id);
                if (!menu || !menu.is_active || isMenuOutOfStock(menu)) {
                    changed = true;
                    continue;
                }

                if (menu.is_limited_stock) {
                    const used = allocated.get(menu.id) ?? 0;
                    const available = Math.max(
                        0,
                        (menu.stock_quantity ?? 0) - used,
                    );
                    const keptQty = Math.min(item.quantity, available);
                    if (keptQty <= 0) {
                        changed = true;
                        continue;
                    }
                    if (keptQty !== item.quantity) {
                        changed = true;
                        next.push({ ...item, quantity: keptQty });
                    } else {
                        next.push(item);
                    }
                    allocated.set(menu.id, used + keptQty);
                } else {
                    next.push(item);
                }
            }

            if (changed) {
                toast.warning(
                    'Sebagian jumlah item di keranjang disesuaikan mengikuti sisa stok terkini.',
                );
                return next;
            }
            return prev;
        });
    }, [stockOverrides, allMenusMap, isLocationBlocked]);

    // Simpan otomatis ke localStorage hanya saat halaman menu aktif & reset idempotency key
    useEffect(() => {
        if (isLocationBlocked) return;
        localStorage.setItem(
            `sideorder_cart_${table.qr_token}`,
            JSON.stringify(cart),
        );
        idempotencyKeyRef.current = '';
    }, [cart, table.qr_token, isLocationBlocked]);

    // Reset lock modal saat modal dibuka/ditutup
    useEffect(() => {
        if (!isCustomizeOpen) {
            modalSubmitLockRef.current = false;
        }
    }, [isCustomizeOpen]);

    const formatRupiah = (amount: number | string) => {
        const numeric =
            typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
        return `Rp ${new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(numeric)}`;
    };

    // Hitung total kuantitas per menu_id di keranjang (opsional kecualikan item yang sedang diedit)
    const getMenuCartQuantity = useCallback(
        (menuId: number, excludeCartId: string | null = null): number => {
            return cart
                .filter(
                    (item) =>
                        item.menu_id === menuId &&
                        item.cart_id !== excludeCartId,
                )
                .reduce((sum, item) => sum + item.quantity, 0);
        },
        [cart],
    );

    const getRemainingStockForMenu = useCallback(
        (menu: Menu, excludeCartId: string | null = null): number => {
            const usedInCart = getMenuCartQuantity(menu.id, excludeCartId);
            if (!menu.is_limited_stock) {
                return Math.max(0, 50 - usedInCart);
            }
            return Math.max(0, (menu.stock_quantity ?? 0) - usedInCart);
        },
        [getMenuCartQuantity],
    );

    // Buka Modal Pemilihan Ukuran/Varian untuk tambah item baru
    const openCustomize = (menu: Menu) => {
        const latestMenu = allMenusMap.get(menu.id) ?? menu;
        if (isMenuOutOfStock(latestMenu)) {
            toast.error(`Maaf, stok menu ${latestMenu.name} sedang habis.`);
            return;
        }

        const remaining = getRemainingStockForMenu(latestMenu);
        if (remaining <= 0) {
            toast.error(
                `Stok tersisa untuk ${latestMenu.name} (${latestMenu.stock_quantity} porsi) sudah semuanya di keranjang Anda.`,
            );
            return;
        }

        setEditingCartId(null);
        setActiveMenu(latestMenu);
        setCustomizeQty(1);
        setCustomizeNotes('');

        // Pre-select default options dari database (hanya 1 untuk grup single-select)
        const defaults: number[] = [];
        if (latestMenu.option_groups) {
            latestMenu.option_groups.forEach((group) => {
                const activeItems = group.option_items.filter(
                    (i) => i.is_active,
                );
                if (activeItems.length === 0) return;

                if (isSingleSelectGroup(group)) {
                    const defaultItem = activeItems.find((i) => i.is_default);
                    if (defaultItem) {
                        defaults.push(defaultItem.id);
                    } else if (group.is_required) {
                        defaults.push(activeItems[0].id);
                    }
                } else {
                    activeItems
                        .filter((i) => i.is_default)
                        .forEach((i) => defaults.push(i.id));
                }
            });
        }

        setSelectedOptionIds(uniqueOptionIds(defaults));
        setIsCustomizeOpen(true);
    };

    // Buka Modal Edit untuk item yang sudah ada di keranjang
    const openEditCartItem = (cartItem: CartItem) => {
        const menu = allMenusMap.get(cartItem.menu_id);
        if (!menu || isMenuOutOfStock(menu)) {
            toast.error('Menu sudah tidak tersedia atau stoknya habis.');
            return;
        }

        setEditingCartId(cartItem.cart_id);
        setActiveMenu(menu);
        setCustomizeQty(cartItem.quantity);
        setCustomizeNotes(cartItem.customer_notes || '');
        setSelectedOptionIds(
            uniqueOptionIds(
                cartItem.selected_options.map((o) => o.option_item_id),
            ),
        );
        setIsCustomizeOpen(true);
    };

    // Handler Tombol +Tambah pada kartu menu homepage
    const handleQuickAdd = (menu: Menu) => {
        const latestMenu = allMenusMap.get(menu.id) ?? menu;
        if (isMenuOutOfStock(latestMenu)) {
            toast.error(`Maaf, stok menu ${latestMenu.name} sedang habis.`);
            return;
        }

        // Jika produk memiliki varian ukuran/opsi, selalu buka modal pemilihan ukuran terlebih dahulu
        if (hasMenuVariants(latestMenu)) {
            openCustomize(latestMenu);
            return;
        }

        const remaining = getRemainingStockForMenu(latestMenu);
        if (remaining <= 0) {
            toast.error(
                latestMenu.is_limited_stock
                    ? `Stok ${latestMenu.name} hanya tersisa ${latestMenu.stock_quantity} porsi.`
                    : 'Batas maksimal per menu di keranjang sudah tercapai.',
            );
            return;
        }

        // Proteksi klik berulang (rapid double click) untuk produk tanpa varian
        const now = Date.now();
        const lastClick = quickAddLockRef.current[latestMenu.id] ?? 0;
        if (now - lastClick < 320) {
            return;
        }
        quickAddLockRef.current[latestMenu.id] = now;

        const cartId = buildCartId(latestMenu.id, [], '');
        const basePrice =
            parseFloat(
                String(latestMenu.final_price ?? latestMenu.base_price),
            ) || 0;

        setCart((prevCart) => {
            const existingIdx = prevCart.findIndex((c) => c.cart_id === cartId);
            if (existingIdx > -1) {
                const updated = [...prevCart];
                updated[existingIdx] = {
                    ...updated[existingIdx],
                    quantity: updated[existingIdx].quantity + 1,
                };
                return updated;
            }

            return [
                ...prevCart,
                {
                    cart_id: cartId,
                    menu_id: latestMenu.id,
                    menu_name: latestMenu.name,
                    base_price: basePrice,
                    unit_price: basePrice,
                    quantity: 1,
                    customer_notes: '',
                    selected_options: [],
                },
            ];
        });

        toast.success(`Ditambahkan: ${latestMenu.name}`);
    };

    // Handler Toggle Opsi di dalam Modal
    const handleToggleOption = (group: OptionGroup, item: OptionItem) => {
        if (isSingleSelectGroup(group)) {
            const groupItemIds = group.option_items.map((i) => i.id);
            setSelectedOptionIds((prev) => {
                const filtered = prev.filter(
                    (id) => !groupItemIds.includes(id),
                );
                // Jika tidak wajib, mengklik opsi yang sedang terpilih dapat membatalkan pilihan
                if (!group.is_required && prev.includes(item.id)) {
                    return uniqueOptionIds(filtered);
                }
                return uniqueOptionIds([...filtered, item.id]);
            });
        } else {
            setSelectedOptionIds((prev) =>
                prev.includes(item.id)
                    ? uniqueOptionIds(prev.filter((id) => id !== item.id))
                    : uniqueOptionIds([...prev, item.id]),
            );
        }
    };

    // Hitung harga satuan item kustom berdasarkan harga dasar + varian terpilih
    const calculateCustomUnitPrice = (): number => {
        if (!activeMenu) return 0;
        let price =
            parseFloat(
                String(activeMenu.final_price ?? activeMenu.base_price),
            ) || 0;

        if (activeMenu.option_groups) {
            activeMenu.option_groups.forEach((group) => {
                group.option_items.forEach((item) => {
                    if (selectedOptionIds.includes(item.id)) {
                        price += parseFloat(item.additional_price) || 0;
                    }
                });
            });
        }
        return price;
    };

    // Simpan ke Keranjang dari Modal (Tambah Baru maupun Edit Item Keranjang)
    const handleSaveFromModal = () => {
        if (!activeMenu || modalSubmitLockRef.current) return;

        const latestMenu = allMenusMap.get(activeMenu.id) ?? activeMenu;
        if (isMenuOutOfStock(latestMenu)) {
            toast.error(`Maaf, stok menu ${latestMenu.name} sudah habis.`);
            return;
        }

        // Validasi grup opsi yang wajib dipilih (is_required)
        if (latestMenu.option_groups) {
            for (const group of latestMenu.option_groups) {
                const activeItems = group.option_items.filter(
                    (i) => i.is_active,
                );
                if (activeItems.length === 0) continue;

                const selectedInGroup = activeItems.filter((i) =>
                    selectedOptionIds.includes(i.id),
                );

                if (group.is_required && selectedInGroup.length === 0) {
                    toast.error(`Silakan pilih ${group.name} terlebih dahulu.`);
                    return;
                }

                if (isSingleSelectGroup(group) && selectedInGroup.length > 1) {
                    toast.error(`Hanya boleh memilih 1 ${group.name}.`);
                    return;
                }
            }
        }

        const maxAllowedForThisEntry = getRemainingStockForMenu(
            latestMenu,
            editingCartId,
        );
        if (maxAllowedForThisEntry <= 0) {
            toast.error(
                `Stok ${latestMenu.name} sudah habis atau batas stok di keranjang sudah tercapai.`,
            );
            return;
        }

        const qtyToSave = Math.max(
            1,
            Math.min(50, maxAllowedForThisEntry, customizeQty),
        );
        if (customizeQty > maxAllowedForThisEntry) {
            toast.error(
                `Jumlah pesanan melebihi sisa stok ${latestMenu.name} (${maxAllowedForThisEntry} porsi tersisa).`,
            );
            return;
        }

        modalSubmitLockRef.current = true;

        const optionsToStore: CartOption[] = [];
        const seenOptionIds = new Set<number>();
        if (latestMenu.option_groups) {
            latestMenu.option_groups.forEach((group) => {
                const matched = group.option_items.filter(
                    (item) =>
                        item.is_active && selectedOptionIds.includes(item.id),
                );
                const itemsToKeep = isSingleSelectGroup(group)
                    ? matched.slice(0, 1)
                    : matched;

                itemsToKeep.forEach((item) => {
                    if (seenOptionIds.has(item.id)) return;
                    seenOptionIds.add(item.id);
                    optionsToStore.push({
                        group_name: group.name,
                        option_name: item.name,
                        additional_price:
                            parseFloat(item.additional_price) || 0,
                        option_item_id: item.id,
                    });
                });
            });
        }

        const basePrice =
            parseFloat(
                String(latestMenu.final_price ?? latestMenu.base_price),
            ) || 0;
        const optionsSum = optionsToStore.reduce(
            (s, o) => s + o.additional_price,
            0,
        );
        const unitPrice = basePrice + optionsSum;
        const normalizedNotes = customizeNotes.trim();
        const optionIds = uniqueOptionIds(
            optionsToStore.map((o) => o.option_item_id),
        );
        const newCartId = buildCartId(
            latestMenu.id,
            optionIds,
            normalizedNotes,
        );
        const optionLabelText =
            optionsToStore.length > 0
                ? ` (${optionsToStore.map((o) => o.option_name).join(', ')})`
                : '';

        if (editingCartId !== null) {
            // MODE EDIT ITEM DI KERANJANG
            setCart((prevCart) => {
                const editIdx = prevCart.findIndex(
                    (c) => c.cart_id === editingCartId,
                );
                if (editIdx === -1) return prevCart;

                // Cek apakah setelah ukuran/catatan diubah, item menjadi identik dengan item lain di keranjang
                const duplicateIdx = prevCart.findIndex(
                    (c, idx) => c.cart_id === newCartId && idx !== editIdx,
                );

                if (duplicateIdx > -1) {
                    return prevCart
                        .map((item, idx) => {
                            if (idx === duplicateIdx) {
                                return {
                                    ...item,
                                    base_price: basePrice,
                                    unit_price: unitPrice,
                                    quantity: Math.min(
                                        50,
                                        item.quantity + qtyToSave,
                                    ),
                                    customer_notes: normalizedNotes,
                                    selected_options: optionsToStore,
                                };
                            }
                            return item;
                        })
                        .filter((_, idx) => idx !== editIdx);
                }

                // Perbarui item di posisi semula dengan harga dan varian baru
                const updated = [...prevCart];
                updated[editIdx] = {
                    cart_id: newCartId,
                    menu_id: latestMenu.id,
                    menu_name: latestMenu.name,
                    base_price: basePrice,
                    unit_price: unitPrice,
                    quantity: qtyToSave,
                    customer_notes: normalizedNotes,
                    selected_options: optionsToStore,
                };
                return updated;
            });

            setEditingCartId(null);
            setIsCustomizeOpen(false);
            toast.success(`Diperbarui: ${latestMenu.name}${optionLabelText}`);
        } else {
            // MODE TAMBAH BARU KE KERANJANG
            setCart((prevCart) => {
                const existingIdx = prevCart.findIndex(
                    (c) => c.cart_id === newCartId,
                );
                if (existingIdx > -1) {
                    const updated = [...prevCart];
                    updated[existingIdx] = {
                        ...updated[existingIdx],
                        base_price: basePrice,
                        unit_price: unitPrice,
                        quantity: Math.min(
                            50,
                            updated[existingIdx].quantity + qtyToSave,
                        ),
                        selected_options: optionsToStore,
                    };
                    return updated;
                }

                return [
                    ...prevCart,
                    {
                        cart_id: newCartId,
                        menu_id: latestMenu.id,
                        menu_name: latestMenu.name,
                        base_price: basePrice,
                        unit_price: unitPrice,
                        quantity: qtyToSave,
                        customer_notes: normalizedNotes,
                        selected_options: optionsToStore,
                    },
                ];
            });

            setIsCustomizeOpen(false);
            toast.success(`Ditambahkan: ${latestMenu.name}${optionLabelText}`);
        }
    };

    // Ubah kuantitas item tertentu di keranjang dengan validasi sisa stok menu
    const updateCartQty = (cartId: string, delta: number) => {
        if (delta > 0) {
            const target = cart.find((c) => c.cart_id === cartId);
            if (target) {
                const menu = allMenusMap.get(target.menu_id);
                if (menu && menu.is_limited_stock) {
                    const totalInCart = getMenuCartQuantity(menu.id);
                    const maxStock = menu.stock_quantity ?? 0;
                    if (totalInCart >= maxStock) {
                        toast.error(
                            `Stok ${menu.name} hanya tersisa ${maxStock} porsi.`,
                        );
                        return;
                    }
                }
            }
        }

        setCart(
            (prevCart) =>
                prevCart
                    .map((item) => {
                        if (item.cart_id === cartId) {
                            const menu = allMenusMap.get(item.menu_id);
                            const maxByStock = menu?.is_limited_stock
                                ? getRemainingStockForMenu(menu, item.cart_id)
                                : 50;
                            const newQty = Math.min(
                                50,
                                maxByStock,
                                item.quantity + delta,
                            );
                            return newQty > 0
                                ? { ...item, quantity: newQty }
                                : null;
                        }
                        return item;
                    })
                    .filter(Boolean) as CartItem[],
        );
    };

    // Hapus item tertentu dari keranjang
    const removeCartItem = (cartId: string) => {
        setCart((prevCart) =>
            prevCart.filter((item) => item.cart_id !== cartId),
        );
    };

    const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalCartPrice = cart.reduce(
        (sum, item) => sum + item.unit_price * item.quantity,
        0,
    );

    // Kirim Checkout ke Backend
    const handleCheckout = (e: React.FormEvent) => {
        e.preventDefault();

        if (isSubmitting || checkoutLockRef.current) {
            return;
        }

        if (cart.length === 0) {
            toast.error('Keranjang belanja Anda masih kosong.');
            return;
        }

        if (!customerName.trim()) {
            toast.error('Nama pemesan wajib diisi.');
            return;
        }

        checkoutLockRef.current = true;
        setIsSubmitting(true);

        if (!idempotencyKeyRef.current) {
            idempotencyKeyRef.current = `${table.id}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        }

        const latestCoords = verifiedCoords ?? loadStoredCoords();

        router.post(
            '/order/checkout',
            {
                qr_token: table.qr_token,
                order_number: activeOrder?.order_number ?? null,
                customer_name: (
                    customerName.trim() ||
                    activeOrder?.customer_name ||
                    ''
                ).trim(),
                payment_method: paymentMethod,
                notes: orderNotes.trim() || null,
                idempotency_key: idempotencyKeyRef.current,
                customer_latitude: latestCoords?.latitude ?? null,
                customer_longitude: latestCoords?.longitude ?? null,
                items: cart.map((item) => ({
                    menu_id: item.menu_id,
                    quantity: item.quantity,
                    customer_notes: item.customer_notes.trim() || null,
                    selected_option_ids: uniqueOptionIds(
                        item.selected_options.map((opt) => opt.option_item_id),
                    ),
                })),
            },
            {
                onError: (errors) => {
                    checkoutLockRef.current = false;
                    setIsSubmitting(false);
                    idempotencyKeyRef.current = '';

                    const locationErr =
                        errors.location || errors.customer_location;
                    if (locationErr) {
                        setIsCartOpen(false);
                        setServerLocationVerified(false);
                        setLocationGateStatus('blocked');
                        toast.error(locationErr);
                        return;
                    }

                    if (
                        Object.keys(errors).some(
                            (key) =>
                                key === 'items' || key.startsWith('items.'),
                        )
                    ) {
                        void fetchStockSync();
                    }

                    toast.error(
                        Object.values(errors)[0] ||
                            'Terjadi kesalahan saat memproses pesanan.',
                    );
                },
                onSuccess: () => {
                    localStorage.removeItem(`sideorder_cart_${table.qr_token}`);
                },
                onFinish: () => {
                    checkoutLockRef.current = false;
                },
            },
        );
    };

    // Filter menu berdasarkan tab dan pencarian
    const displayedCategories = useMemo(() => {
        return resolvedCategories
            .filter(
                (cat) =>
                    selectedCategory === 'all' || cat.id === selectedCategory,
            )
            .map((cat) => ({
                ...cat,
                menus: cat.menus.filter(
                    (m) =>
                        m.name
                            .toLowerCase()
                            .includes(searchQuery.toLowerCase()) ||
                        (m.description &&
                            m.description
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase())),
                ),
            }))
            .filter((cat) => cat.menus.length > 0);
    }, [resolvedCategories, selectedCategory, searchQuery]);

    const activeRemainingStock = activeMenu
        ? getRemainingStockForMenu(activeMenu, editingCartId)
        : 50;

    if (!orderingStatus.enabled) {
        return (
            <>
                <Head
                    title={`Pemesanan Ditutup - Meja ${table.table_number} • ${orderingStatus.cafe_name}`}
                />
                <div className="flex min-h-dvh items-center justify-center bg-[#141413] p-0 font-sans selection:bg-[#C52828] selection:text-white md:py-4">
                    <div className="relative flex min-h-dvh w-full max-w-md flex-col items-center justify-center overflow-hidden bg-[#FAF8F4] px-6 py-8 shadow-2xl sm:max-w-lg md:min-h-[88dvh] md:rounded-2xl md:border-[8px] md:border-[#242321]">
                        <div className="w-full max-w-sm rounded-2xl border border-[#E8E2D9] bg-[#FFFDFB] p-7 text-center shadow-[0_8px_24px_rgba(26,26,26,0.04)]">
                            <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-[#FDECEB] text-[#C52828]">
                                <Storefront
                                    weight="duotone"
                                    className="size-8"
                                />
                            </div>

                            <span className="inline-flex items-center rounded-full border border-[#E6DFD3] bg-[#FAF6EC] px-2.5 py-0.5 text-[10.5px] font-bold text-[#78716C] uppercase">
                                Meja {table.table_number} •{' '}
                                {orderingStatus.cafe_name}
                            </span>

                            <h1 className="mt-3 text-lg font-extrabold tracking-tight text-[#1A1A1A]">
                                Pemesanan QR Sedang Ditutup
                            </h1>
                            <p className="mt-2 text-xs leading-relaxed text-[#6E6A64] sm:text-sm">
                                {orderingStatus.closed_message}
                            </p>

                            <button
                                type="button"
                                onClick={() => router.reload()}
                                className="mt-6 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C52828] px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(197,40,40,0.28)] transition hover:bg-[#B02222] active:scale-[0.99]"
                            >
                                <ArrowClockwise
                                    weight="bold"
                                    className="size-4"
                                />
                                <span>Periksa Status Pemesanan</span>
                            </button>
                        </div>
                    </div>
                </div>
            </>
        );
    }

    if (isLocationBlocked) {
        const isChecking = locationGateStatus === 'checking';

        const handleRetryLocation = () => {
            if (
                typeof window !== 'undefined' &&
                window.location.protocol === 'http:' &&
                !['localhost', '127.0.0.1', '[::1]'].includes(
                    window.location.hostname,
                )
            ) {
                window.location.href = `https://${window.location.host}${window.location.pathname}${window.location.search}`;
                return;
            }

            requestCustomerLocation();
        };

        return (
            <>
                <Head
                    title={`Pesan Menu - Meja ${table.table_number} • SIDE LINE`}
                />
                <div className="flex min-h-dvh items-center justify-center bg-[#141413] p-0 font-sans selection:bg-[#C52828] selection:text-white md:py-4">
                    <div className="relative flex min-h-dvh w-full max-w-md flex-col items-center justify-center overflow-hidden bg-[#FAF8F4] px-6 py-8 shadow-2xl sm:max-w-lg md:min-h-[88dvh] md:rounded-2xl md:border-[8px] md:border-[#242321]">
                        {isChecking ? (
                            <div className="flex flex-col items-center justify-center text-center">
                                <div className="size-10 animate-spin rounded-full border-[3px] border-[#E8E2D9] border-t-[#C52828]" />
                                <p className="mt-4 text-sm font-medium text-[#6E6A64]">
                                    Memuat halaman...
                                </p>
                            </div>
                        ) : (
                            <div className="w-full max-w-sm rounded-2xl border border-[#E8E2D9] bg-[#FFFDFB] p-7 text-center shadow-[0_8px_24px_rgba(26,26,26,0.04)]">
                                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-[#FDECEB] text-[#C52828]">
                                    <MapPin
                                        weight="duotone"
                                        className="size-8"
                                    />
                                </div>

                                <h1 className="text-lg font-extrabold tracking-tight text-[#1A1A1A]">
                                    Lokasi Di Luar Jangkauan
                                </h1>
                                <p className="mt-2 text-xs leading-relaxed text-[#6E6A64] sm:text-sm">
                                    Layanan pemesanan hanya tersedia di area{' '}
                                    {locationAccess.cafe_name}. Silakan muat
                                    ulang halaman.
                                </p>

                                <button
                                    type="button"
                                    onClick={handleRetryLocation}
                                    className="mt-6 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C52828] px-4 text-sm font-bold text-white shadow-[0_6px_16px_rgba(197,40,40,0.28)] transition hover:bg-[#B02222] active:scale-[0.99]"
                                >
                                    <ArrowClockwise
                                        weight="bold"
                                        className="size-4"
                                    />
                                    <span>Muat Ulang</span>
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <Head
                title={`Pesan Menu - Meja ${table.table_number} • SIDE LINE`}
            />

            {/* WRAPPER DESKTOP FRAME:
                Header & Navbar sticky diam di atas, hanya area daftar menu yang bisa di-scroll,
                dan bar keranjang sticky diam di bawah.
            */}
            <div className="flex h-dvh items-center justify-center overflow-hidden bg-[#141413] font-sans selection:bg-[#C52828] selection:text-white md:py-4">
                <div className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-[#FAF8F4] shadow-2xl sm:max-w-lg md:h-[94dvh] md:rounded-2xl md:border-[8px] md:border-[#242321]">
                    {/* BAGIAN ATAS STICKY (HEADER + INFO MEJA + SEARCH + KATEGORI NAVBAR DIAM) */}
                    <div className="sticky top-0 z-20 shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4]/95 backdrop-blur-xs">
                        {/* 1. TOP BRAND HEADER */}
                        <header className="animate-sideline-header flex items-center justify-between px-3 pt-2.5 pb-1.5 sm:px-4 sm:pt-3">
                            <div className="flex items-center gap-2">
                                {/* Icon Logo Kafe SIDELINE */}
                                <div className="flex size-8 items-center justify-center overflow-hidden rounded-lg bg-[#C52828] shadow-sm ring-1 shadow-[#C52828]/20 ring-black/5 sm:size-9">
                                    <img
                                        src="/images/sideline-icon.png"
                                        alt="SIDELINE"
                                        className="size-full object-cover"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[13.5px] leading-tight font-bold tracking-tight text-[#1A1A1A] uppercase sm:text-[14.5px]">
                                            SIDE LINE
                                        </span>
                                    </div>
                                    <p className="text-[8px] font-semibold tracking-[0.12em] text-[#6E6A64] uppercase sm:text-[8.5px]">
                                        Coffee &bull; Eatery
                                    </p>
                                </div>
                            </div>

                            <span className="inline-flex items-center rounded-[4px] bg-[#1A1A1A] px-2 py-1 text-[9.5px] leading-none font-bold text-white">
                                MEJA {table.table_number}
                            </span>
                        </header>

                        {/* 2. CARD INFO MEJA & WIFI */}
                        <div className="px-3 pt-1 pb-2 sm:px-4">
                            <div className="space-y-1.5 rounded-lg border border-[#E8E2D9] bg-[#FFFDFB] px-2.5 py-2 shadow-[0_2px_10px_rgba(26,26,26,0.03)]">
                                {/* Baris Atas Info Meja */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        {/* Pill Hitam Nomor Meja */}
                                        <span className="shrink-0 rounded-[4px] bg-[#1A1A1A] px-2 py-1 text-[9px] leading-none font-bold whitespace-nowrap text-white">
                                            MEJA {table.table_number}
                                        </span>

                                        {/* Token Meja */}
                                        <span className="flex min-w-0 items-center gap-1 rounded-[4px] border border-emerald-200/80 bg-emerald-50 px-1.5 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap text-emerald-700">
                                            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
                                            <span className="truncate">
                                                QR-
                                                {table.qr_token
                                                    .substring(0, 8)
                                                    .toUpperCase()}
                                            </span>
                                        </span>
                                    </div>
                                </div>

                                {/* Baris Bawah Lokasi & WiFi */}
                                <div className="flex items-center justify-between gap-2 border-t border-[#F0EAE1] pt-1.5">
                                    <div className="flex min-w-0 items-center gap-1 text-[10px] font-medium text-[#3F3A34]">
                                        <Storefront
                                            weight="duotone"
                                            className="size-3 shrink-0 text-[#4A2C18]"
                                        />
                                        <span className="truncate">
                                            {table.name ||
                                                'Area Indoor Lantai 1'}
                                        </span>
                                    </div>

                                    <div className="flex shrink-0 items-center gap-1 rounded-[4px] border border-[#E8E2D9] bg-[#F5F1E9] px-1.5 py-0.5 text-[9px] leading-none font-semibold whitespace-nowrap text-[#4A2C18]">
                                        <WifiHigh
                                            weight="bold"
                                            className="size-2.5 text-[#C52828]"
                                        />
                                        <span>WIFI: SIDELINE-GUEST</span>
                                    </div>
                                </div>
                            </div>

                            {/* Banner Pesanan Aktif (Mode Tambah Menu ke Pesanan yang Sedang Berjalan) */}
                            {activeOrder && (
                                <div className="mt-1.5 space-y-1 rounded-lg border border-[#2E2C29] bg-[#1A1A1A] px-3 py-2 text-white shadow-sm">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-emerald-400" />
                                            <span className="truncate text-[10.5px] font-semibold tracking-tight">
                                                Tambah Menu ke #
                                                {activeOrder.order_number}
                                            </span>
                                        </div>
                                        <Link
                                            href={`/order/status/${activeOrder.order_number}`}
                                            className="shrink-0 rounded-[4px] bg-white/15 px-2 py-1 text-[9.5px] leading-none font-semibold whitespace-nowrap text-white transition hover:bg-white/25"
                                        >
                                            Lihat Status &amp; Nota
                                        </Link>
                                    </div>
                                    <p className="text-[10px] leading-relaxed text-neutral-300">
                                        Pesanan atas nama{' '}
                                        <strong className="font-semibold text-white">
                                            {activeOrder.customer_name}
                                        </strong>{' '}
                                        sedang{' '}
                                        <strong className="font-semibold text-amber-300">
                                            {activeOrder.order_status ===
                                            'processing'
                                                ? 'diracik barista'
                                                : 'menunggu konfirmasi'}
                                        </strong>{' '}
                                        ({activeOrder.active_items_count} item •{' '}
                                        <span className="font-semibold text-white tabular-nums">
                                            {formatRupiah(
                                                activeOrder.total_amount,
                                            )}
                                        </span>
                                        ). Menu baru akan digabungkan ke pesanan
                                        ini.
                                    </p>
                                </div>
                            )}

                            {!activeOrder && lockedOrderNotice && (
                                <div className="mt-1.5 flex items-start gap-2 rounded-lg border border-[#F2DEC0] bg-[#FFF8EB] p-2 text-[10px] text-[#5C4318]">
                                    <WarningCircle
                                        weight="fill"
                                        className="mt-0.5 size-3.5 shrink-0 text-[#C52828]"
                                    />
                                    <span className="leading-relaxed">
                                        {lockedOrderNotice}
                                    </span>
                                </div>
                            )}

                            {!activeOrder && lastOrderNumber && (
                                <div className="mt-1.5 flex items-center justify-between gap-2 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] px-2.5 py-1.5 text-[10px]">
                                    <span className="truncate font-medium text-[#3F3A34]">
                                        Pesanan meja ini:{' '}
                                        <strong className="font-bold text-[#1A1A1A] tabular-nums">
                                            #{lastOrderNumber}
                                        </strong>
                                    </span>
                                    <Link
                                        href={`/order/status/${lastOrderNumber}`}
                                        className="shrink-0 rounded-[4px] bg-[#1A1A1A] px-2 py-1 text-[9.5px] leading-none font-bold whitespace-nowrap text-white transition hover:bg-[#C52828]"
                                    >
                                        Lihat Status &amp; Nota
                                    </Link>
                                </div>
                            )}
                        </div>

                        {/* 3. INPUT PENCARIAN */}
                        <div className="px-3 pb-2 sm:px-4">
                            <div className="flex items-center gap-2 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] px-3 py-1.5 transition focus-within:border-[#C52828] focus-within:bg-[#FFFDFB]">
                                <MagnifyingGlass
                                    weight="bold"
                                    className="size-3.5 shrink-0 text-[#6E6A64]"
                                />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) =>
                                        setSearchQuery(e.target.value)
                                    }
                                    placeholder="Cari kopi, pastry, atau cemilan..."
                                    className="flex-1 bg-transparent text-[11.5px] font-medium text-[#1A1A1A] outline-none placeholder:text-[#8C857B]"
                                />
                                {searchQuery ? (
                                    <button
                                        type="button"
                                        onClick={() => setSearchQuery('')}
                                        className="cursor-pointer text-[#6E6A64] hover:text-[#1A1A1A]"
                                    >
                                        <PhX weight="bold" className="size-3" />
                                    </button>
                                ) : (
                                    <PhSlidersHorizontal
                                        weight="bold"
                                        className="size-3.5 shrink-0 text-[#8C857B]"
                                    />
                                )}
                            </div>
                        </div>

                        {/* 4. HORIZONTAL CATEGORY PILLS NAVBAR */}
                        <div className="px-3 pb-2 sm:px-4">
                            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto py-0.5 sm:gap-2">
                                {/* Tombol Semua */}
                                <button
                                    type="button"
                                    onClick={() => setSelectedCategory('all')}
                                    className={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-[10.5px] leading-none font-semibold whitespace-nowrap transition-all sm:px-3 sm:text-[11px] ${
                                        selectedCategory === 'all'
                                            ? 'flex items-center gap-1.5 bg-[#1A1A1A] text-white shadow-2xs'
                                            : 'border border-[#E6DFD3] bg-[#F3EFE6] text-[#3F3A34] hover:bg-[#EAE3D5]'
                                    }`}
                                >
                                    {selectedCategory === 'all' && (
                                        <span className="size-1.5 rounded-full bg-[#C52828]" />
                                    )}
                                    <span>Semua</span>
                                </button>

                                {/* Tombol per Kategori */}
                                {categories.map((cat) => {
                                    const isSelected =
                                        selectedCategory === cat.id;
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() =>
                                                setSelectedCategory(cat.id)
                                            }
                                            className={`shrink-0 cursor-pointer rounded-lg px-2.5 py-1.5 text-[10.5px] leading-none font-semibold whitespace-nowrap transition-all sm:px-3 sm:text-[11px] ${
                                                isSelected
                                                    ? 'flex items-center gap-1.5 bg-[#1A1A1A] text-white shadow-2xs'
                                                    : 'border border-[#E6DFD3] bg-[#F3EFE6] text-[#3F3A34] hover:bg-[#EAE3D5]'
                                            }`}
                                        >
                                            {isSelected && (
                                                <span className="size-1.5 rounded-full bg-[#C52828]" />
                                            )}
                                            <span>{cat.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* 5. AREA DAFTAR MENU (HANYA BAGIAN INI YANG BISA DI-SCROLL) */}
                    <main className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 pt-2.5 pb-5 sm:space-y-4 sm:px-4 sm:pt-3 sm:pb-6">
                        {displayedCategories.length === 0 ? (
                            <div className="space-y-1.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-6 text-center text-[#6E6A64]">
                                <PhCoffee
                                    weight="duotone"
                                    className="mx-auto size-8 text-[#8C857B]"
                                />
                                <p className="text-xs font-bold text-[#1A1A1A] sm:text-sm">
                                    Menu tidak ditemukan
                                </p>
                                <p className="text-[11px] text-[#6E6A64]">
                                    Coba cari dengan kata kunci lain.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4 sm:space-y-5">
                                {displayedCategories.map((cat, catIdx) => (
                                    <section key={cat.id} className="space-y-2">
                                        {/* Penanda / Pembatas Antar Kategori Menu */}
                                        <div
                                            className={cn(
                                                'flex items-center gap-2 px-0.5',
                                                catIdx > 0 && 'pt-1',
                                            )}
                                        >
                                            <div className="flex shrink-0 items-center gap-1.5">
                                                <span className="size-1.5 rounded-full bg-[#C52828]" />
                                                <h3 className="text-[11px] font-bold tracking-wider text-[#1A1A1A] uppercase">
                                                    {cat.name}
                                                </h3>
                                            </div>
                                            <div className="h-px flex-1 bg-[#E8E2D8]" />
                                            <span className="shrink-0 rounded-[4px] border border-[#E6DFD3] bg-[#F3EFE6] px-2 py-0.5 text-[9.5px] font-semibold text-[#4A2C18]">
                                                {cat.menus.length} Menu
                                            </span>
                                        </div>

                                        {/* Daftar Card Menu dalam Kategori Ini */}
                                        <div className="space-y-2">
                                            {cat.menus.map((menu) => {
                                                const menuCartItems =
                                                    cart.filter(
                                                        (item) =>
                                                            item.menu_id ===
                                                            menu.id,
                                                    );
                                                const cartQty =
                                                    menuCartItems.reduce(
                                                        (sum, item) =>
                                                            sum + item.quantity,
                                                        0,
                                                    );
                                                const menuHasVariants =
                                                    hasMenuVariants(menu);
                                                const outOfStock =
                                                    isMenuOutOfStock(menu);
                                                const remainingForMenu =
                                                    getRemainingStockForMenu(
                                                        menu,
                                                    );
                                                const stockReachedLimit =
                                                    !outOfStock &&
                                                    Boolean(
                                                        menu.is_limited_stock,
                                                    ) &&
                                                    remainingForMenu <= 0;
                                                const stockQty =
                                                    menu.stock_quantity ?? 0;
                                                const imageSrc = menu.image_path
                                                    ? `/storage/${menu.image_path}`
                                                    : getMenuFallbackImage(
                                                          menu.name,
                                                          cat.name,
                                                      );

                                                return (
                                                    <div
                                                        key={menu.id}
                                                        className={cn(
                                                            'group relative flex items-center gap-2.5 rounded-xl border p-2.5 transition-all duration-200 sm:gap-3 sm:p-3',
                                                            outOfStock
                                                                ? 'border-[#E8E2D9] bg-[#F7F4EE]/80 opacity-85'
                                                                : cartQty > 0
                                                                  ? 'border-[#C52828]/50 bg-[#FFFDFB] shadow-[0_2px_10px_rgba(197,40,40,0.05)]'
                                                                  : 'border-[#E8E2D9] bg-[#FFFDFB] shadow-[0_2px_8px_rgba(26,26,26,0.02)] hover:border-[#DCD4C6]',
                                                        )}
                                                    >
                                                        {/* Kiri: Foto Produk Compact (Utuh / Tidak Terpotong) */}
                                                        <div
                                                            className={cn(
                                                                'relative h-[72px] w-[60px] shrink-0 overflow-hidden rounded-lg border border-[#EAE2D6] bg-[#EFECE6] sm:h-[80px] sm:w-[68px]',
                                                                outOfStock
                                                                    ? 'cursor-not-allowed'
                                                                    : 'cursor-pointer',
                                                            )}
                                                            onClick={() => {
                                                                if (
                                                                    !outOfStock
                                                                ) {
                                                                    openCustomize(
                                                                        menu,
                                                                    );
                                                                }
                                                            }}
                                                            title={
                                                                outOfStock
                                                                    ? 'Stok menu ini sedang habis'
                                                                    : 'Klik untuk lihat detail & kustomisasi'
                                                            }
                                                        >
                                                            <img
                                                                src={imageSrc}
                                                                alt=""
                                                                aria-hidden="true"
                                                                className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-30 blur-md"
                                                                loading="lazy"
                                                            />
                                                            <img
                                                                src={imageSrc}
                                                                alt={menu.name}
                                                                className={cn(
                                                                    'relative z-10 size-full object-contain transition-transform duration-300',
                                                                    outOfStock
                                                                        ? 'opacity-65 grayscale'
                                                                        : 'group-hover:scale-105',
                                                                )}
                                                                loading="lazy"
                                                            />

                                                            {outOfStock && (
                                                                <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#1A1A1A]/45">
                                                                    <span className="rounded-[4px] bg-[#1A1A1A]/90 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-white uppercase shadow-xs">
                                                                        Habis
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Kanan: Judul + Badge, Deskripsi, Harga & Tombol + Tambah */}
                                                        <div className="flex min-w-0 flex-1 flex-col justify-between">
                                                            <div>
                                                                <div className="flex flex-wrap items-center gap-1">
                                                                    <h4
                                                                        onClick={() => {
                                                                            if (
                                                                                !outOfStock
                                                                            ) {
                                                                                openCustomize(
                                                                                    menu,
                                                                                );
                                                                            }
                                                                        }}
                                                                        className={cn(
                                                                            'text-[13px] leading-snug font-bold tracking-tight transition-colors sm:text-[13.5px]',
                                                                            outOfStock
                                                                                ? 'cursor-not-allowed text-[#6E6A64]'
                                                                                : 'cursor-pointer text-[#1A1A1A] hover:text-[#C52828]',
                                                                        )}
                                                                    >
                                                                        {
                                                                            menu.name
                                                                        }
                                                                    </h4>

                                                                    {menu.is_discount_active &&
                                                                        (menu.discount_amount ||
                                                                            0) >
                                                                            0 && (
                                                                            <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-[#F5C2C0] bg-[#FDECEB] px-1.5 py-0.5 text-[8.5px] leading-none font-extrabold text-[#C52828]">
                                                                                <Flame
                                                                                    weight="fill"
                                                                                    className="size-2.5 shrink-0 text-[#C52828]"
                                                                                />
                                                                                {menu.discount_type ===
                                                                                'percent'
                                                                                    ? `${parseFloat(String(menu.discount_value))}% OFF`
                                                                                    : `HEMAT ${formatRupiah(menu.discount_value || 0)}`}
                                                                            </span>
                                                                        )}

                                                                    {!outOfStock &&
                                                                        menuHasVariants && (
                                                                            <span className="inline-flex items-center rounded-[4px] border border-[#E6DFD3] bg-[#F5EFE6] px-1.5 py-0.5 text-[8.5px] leading-none font-semibold text-[#5C544B]">
                                                                                Varian
                                                                            </span>
                                                                        )}

                                                                    {outOfStock ? (
                                                                        <span className="inline-flex items-center rounded-[4px] border border-[#DFD8CD] bg-[#EFECE6] px-1.5 py-0.5 text-[8.5px] leading-none font-bold text-[#6E6A64]">
                                                                            Habis
                                                                        </span>
                                                                    ) : menu.is_limited_stock ? (
                                                                        <span
                                                                            className={cn(
                                                                                'inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[8.5px] leading-none font-bold tabular-nums',
                                                                                stockQty <=
                                                                                    5
                                                                                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                                                                                    : 'border-[#E6DFD3] bg-[#F5EFE6] text-[#5C544B]',
                                                                            )}
                                                                        >
                                                                            {stockQty <=
                                                                            5
                                                                                ? `Sisa ${stockQty}`
                                                                                : `Stok ${stockQty}`}
                                                                        </span>
                                                                    ) : null}

                                                                    {cartQty >
                                                                        0 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (
                                                                                    menuCartItems.length ===
                                                                                    1
                                                                                ) {
                                                                                    openEditCartItem(
                                                                                        menuCartItems[0],
                                                                                    );
                                                                                } else {
                                                                                    setIsCartOpen(
                                                                                        true,
                                                                                    );
                                                                                }
                                                                            }}
                                                                            className="inline-flex cursor-pointer items-center rounded-[4px] bg-[#C52828] px-1.5 py-0.5 text-[8.5px] leading-none font-bold text-white transition hover:bg-[#B02222]"
                                                                            title="Klik untuk ubah pesanan ini"
                                                                        >
                                                                            {
                                                                                cartQty
                                                                            }
                                                                            x di
                                                                            Keranjang
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {menu.description && (
                                                                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-[#6E6A64]">
                                                                        {
                                                                            menu.description
                                                                        }
                                                                    </p>
                                                                )}
                                                            </div>

                                                            {/* Baris Bawah: MULAI DARI + Harga di Kiri, Tombol + Tambah / + Tambah Lagi di Kanan */}
                                                            <div className="mt-2 flex items-end justify-between gap-1.5">
                                                                <div className="min-w-0">
                                                                    <span className="block text-[8px] leading-none font-semibold tracking-wider text-[#8C857B] uppercase">
                                                                        MULAI
                                                                        DARI
                                                                    </span>
                                                                    {menu.is_discount_active &&
                                                                    (menu.discount_amount ||
                                                                        0) >
                                                                        0 ? (
                                                                        <div className="mt-0.5 flex flex-wrap items-baseline gap-1">
                                                                            <span className="text-[13px] leading-tight font-extrabold whitespace-nowrap text-[#C52828] tabular-nums sm:text-[13.5px]">
                                                                                {formatRupiah(
                                                                                    menu.final_price ??
                                                                                        menu.base_price,
                                                                                )}
                                                                            </span>
                                                                            <s className="text-[10px] leading-none font-medium whitespace-nowrap text-[#8C857B]">
                                                                                {formatRupiah(
                                                                                    menu.base_price,
                                                                                )}
                                                                            </s>
                                                                        </div>
                                                                    ) : (
                                                                        <span className="mt-0.5 block text-[13px] leading-tight font-bold whitespace-nowrap text-[#C52828] tabular-nums sm:text-[13.5px]">
                                                                            {formatRupiah(
                                                                                menu.base_price,
                                                                            )}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        outOfStock ||
                                                                        stockReachedLimit
                                                                    }
                                                                    onClick={() =>
                                                                        handleQuickAdd(
                                                                            menu,
                                                                        )
                                                                    }
                                                                    className={cn(
                                                                        'inline-flex shrink-0 items-center justify-center rounded-lg px-2.5 py-1 text-[10.5px] font-bold whitespace-nowrap transition sm:px-3 sm:py-1.5 sm:text-[11px]',
                                                                        outOfStock
                                                                            ? 'cursor-not-allowed bg-[#E5DFD5] text-[#7D766D] shadow-none'
                                                                            : stockReachedLimit
                                                                              ? 'cursor-not-allowed border border-[#DCD4C6] bg-[#EFECE6] text-[#6E6A64] shadow-none'
                                                                              : 'cursor-pointer bg-[#C52828] text-white shadow-[0_3px_10px_rgba(197,40,40,0.22)] hover:bg-[#B02222] active:scale-95',
                                                                    )}
                                                                >
                                                                    <span>
                                                                        {outOfStock
                                                                            ? 'Stok Habis'
                                                                            : stockReachedLimit
                                                                              ? 'Maks.'
                                                                              : cartQty >
                                                                                  0
                                                                                ? '+ Lagi'
                                                                                : '+ Tambah'}
                                                                    </span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </section>
                                ))}
                            </div>
                        )}

                        {/* 6. BANNER ALERGI & CATATAN KHUSUS */}
                        <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#E6DFD3] bg-[#F3EFE6] p-2.5 text-[10.5px] text-[#3F3A34] sm:p-3">
                            <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-[#FDECEB] text-[#C52828]">
                                <PencilSimpleLine
                                    weight="bold"
                                    className="size-3"
                                />
                            </div>
                            <p className="text-[10.5px] leading-relaxed text-[#5E5850]">
                                Ada permintaan takaran gula, es, atau alergi
                                tertentu? Kamu bisa menambahkan{' '}
                                <strong className="font-semibold text-[#1A1A1A]">
                                    Catatan Khusus
                                </strong>{' '}
                                pada setiap menu atau saat checkout.
                            </p>
                        </div>
                    </main>

                    {/* 7. STICKY BOTTOM CHECKOUT BAR (DIAM DI BAWAH) */}
                    {cart.length > 0 && (
                        <div className="sticky right-0 bottom-0 left-0 z-30 shrink-0 bg-gradient-to-t from-[#FAF8F4] via-[#FAF8F4]/95 to-transparent px-3 pt-1.5 pb-2.5 sm:px-3.5 sm:pb-3.5">
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-[#2E2C29] bg-[#1A1A1A] p-2.5 pl-3 text-white shadow-2xl sm:p-3 sm:pl-4">
                                <div className="min-w-0">
                                    <span className="block text-[8.5px] font-semibold tracking-wider text-[#A39E95] uppercase sm:text-[9.5px]">
                                        RINGKASAN KERANJANG
                                    </span>
                                    <div className="truncate text-xs font-bold text-white tabular-nums sm:text-[13px]">
                                        {totalCartItems} Item &bull;{' '}
                                        {formatRupiah(totalCartPrice)}
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setIsCartOpen(true)}
                                    className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-[#C52828] px-3 py-2 text-[11px] font-bold text-white shadow-[0_4px_14px_rgba(197,40,40,0.35)] transition hover:bg-[#B02222] active:scale-95 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-xs"
                                >
                                    <ShoppingCart
                                        weight="fill"
                                        className="size-3.5"
                                    />
                                    <span>Keranjang ({totalCartItems})</span>
                                    <PhArrowRight
                                        weight="bold"
                                        className="size-3"
                                    />
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ========================================================================= */}
                    {/* MODAL 1: KUSTOMISASI MENU / EDIT UKURAN & ITEM KERANJANG                  */}
                    {/* ========================================================================= */}
                    <Dialog
                        open={isCustomizeOpen}
                        onOpenChange={(open) => {
                            setIsCustomizeOpen(open);
                            if (!open) {
                                setEditingCartId(null);
                            }
                        }}
                    >
                        <DialogContent className="flex max-h-[86dvh] w-[calc(100%-1.5rem)] max-w-[356px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-[390px] [&>button:last-child]:hidden">
                            {activeMenu &&
                                (() => {
                                    const modalImageSrc = activeMenu.image_path
                                        ? `/storage/${activeMenu.image_path}`
                                        : getMenuFallbackImage(
                                              activeMenu.name,
                                              '',
                                          );
                                    const unitPrice =
                                        calculateCustomUnitPrice();

                                    return (
                                        <div className="flex h-full max-h-[86dvh] flex-col overflow-hidden">
                                            {/* Scrollable Body: Compact Header + Photo + Options + Notes */}
                                            <div className="flex-1 overflow-x-hidden overflow-y-auto">
                                                <div className="relative space-y-3 bg-[#FAF8F4] p-3.5 sm:p-4">
                                                    {/* Close Button Top-Right */}
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setIsCustomizeOpen(
                                                                false,
                                                            );
                                                            setEditingCartId(
                                                                null,
                                                            );
                                                        }}
                                                        aria-label="Tutup detail produk"
                                                        className="absolute top-3 right-3 z-20 flex size-7 cursor-pointer items-center justify-center rounded-full bg-[#EFECE6] text-[#1A1A1A] transition hover:bg-[#E5E0D6] active:scale-95"
                                                    >
                                                        <PhX
                                                            weight="bold"
                                                            className="size-3.5"
                                                        />
                                                    </button>

                                                    {/* Header: Foto Compact Utuh + Judul + Harga + Deskripsi */}
                                                    <DialogHeader className="space-y-2 text-left">
                                                        <div className="flex items-start gap-3">
                                                            {/* Framed Compact Image (uncropped across portrait/square/landscape ratios) */}
                                                            <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-[#E6DFD3] bg-[#EFECE6] sm:h-26 sm:w-22">
                                                                <img
                                                                    src={
                                                                        modalImageSrc
                                                                    }
                                                                    alt=""
                                                                    aria-hidden="true"
                                                                    className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-30 blur-md"
                                                                />
                                                                <img
                                                                    src={
                                                                        modalImageSrc
                                                                    }
                                                                    alt={
                                                                        activeMenu.name
                                                                    }
                                                                    className="relative z-10 size-full object-contain"
                                                                />
                                                            </div>

                                                            <div className="min-w-0 flex-1 pr-7">
                                                                {editingCartId !==
                                                                    null && (
                                                                    <span className="mb-1 inline-block rounded-md bg-[#1A1A1A] px-2 py-0.5 text-[9px] font-bold tracking-wide text-white">
                                                                        Ubah
                                                                        Item
                                                                        Keranjang
                                                                    </span>
                                                                )}

                                                                <DialogTitle className="text-[15px] leading-snug font-bold tracking-tight text-[#1A1A1A] sm:text-base">
                                                                    {
                                                                        activeMenu.name
                                                                    }
                                                                </DialogTitle>

                                                                <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                                                                    <span className="text-sm leading-tight font-extrabold whitespace-nowrap text-[#C52828] tabular-nums sm:text-[15px]">
                                                                        {formatRupiah(
                                                                            unitPrice,
                                                                        )}
                                                                    </span>
                                                                    {activeMenu.is_discount_active &&
                                                                        (activeMenu.discount_amount ||
                                                                            0) >
                                                                            0 && (
                                                                            <s className="text-[10.5px] leading-none whitespace-nowrap text-[#8C857B]">
                                                                                {formatRupiah(
                                                                                    (parseFloat(
                                                                                        activeMenu.base_price,
                                                                                    ) ||
                                                                                        0) +
                                                                                        (unitPrice -
                                                                                            (parseFloat(
                                                                                                String(
                                                                                                    activeMenu.final_price ??
                                                                                                        activeMenu.base_price,
                                                                                                ),
                                                                                            ) ||
                                                                                                0)),
                                                                                )}
                                                                            </s>
                                                                        )}
                                                                </div>

                                                                {(activeMenu.is_discount_active ||
                                                                    activeMenu.is_limited_stock) && (
                                                                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                                                        {activeMenu.is_discount_active &&
                                                                            (activeMenu.discount_amount ||
                                                                                0) >
                                                                                0 && (
                                                                                <span className="inline-flex items-center gap-0.5 rounded-[4px] border border-[#F5C2C0] bg-[#FDECEB] px-1.5 py-0.5 text-[8.5px] leading-none font-extrabold text-[#C52828]">
                                                                                    <Flame
                                                                                        weight="fill"
                                                                                        className="size-2.5 shrink-0 text-[#C52828]"
                                                                                    />
                                                                                    {activeMenu.discount_type ===
                                                                                    'percent'
                                                                                        ? `Diskon ${parseFloat(String(activeMenu.discount_value))}%`
                                                                                        : `Hemat ${formatRupiah(activeMenu.discount_value || 0)}`}
                                                                                </span>
                                                                            )}
                                                                        {activeMenu.is_limited_stock && (
                                                                            <span
                                                                                className={cn(
                                                                                    'inline-flex items-center rounded-[4px] border px-1.5 py-0.5 text-[8.5px] leading-none font-bold tabular-nums',
                                                                                    activeRemainingStock <=
                                                                                        0
                                                                                        ? 'border-[#DFD8CD] bg-[#EFECE6] text-[#6E6A64]'
                                                                                        : (activeMenu.stock_quantity ??
                                                                                                0) <=
                                                                                            5
                                                                                          ? 'border-amber-300 bg-amber-50 text-amber-800'
                                                                                          : 'border-[#E6DFD3] bg-[#F5EFE6] text-[#5C544B]',
                                                                                )}
                                                                            >
                                                                                {activeRemainingStock <=
                                                                                0
                                                                                    ? 'Batas stok tercapai'
                                                                                    : `Tersisa ${activeMenu.stock_quantity ?? 0} • Maks. ${activeRemainingStock}`}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {activeMenu.description && (
                                                            <DialogDescription className="text-[11px] leading-relaxed text-[#6E6A64]">
                                                                {
                                                                    activeMenu.description
                                                                }
                                                            </DialogDescription>
                                                        )}
                                                    </DialogHeader>

                                                    <div className="h-px w-full bg-[#EBE5DC]" />

                                                    {/* Grup Opsi Kustomisasi (Grid 2 Kolom Rapi + Opsi Tambahan) */}
                                                    {activeMenu.option_groups &&
                                                        activeMenu.option_groups
                                                            .length > 0 && (
                                                            <div className="space-y-3">
                                                                {activeMenu.option_groups.map(
                                                                    (group) => {
                                                                        const isSingle =
                                                                            isSingleSelectGroup(
                                                                                group,
                                                                            );
                                                                        const baseMenuPrice =
                                                                            parseFloat(
                                                                                String(
                                                                                    activeMenu.final_price ??
                                                                                        activeMenu.base_price,
                                                                                ),
                                                                            ) ||
                                                                            0;
                                                                        const activeItems =
                                                                            group.option_items.filter(
                                                                                (
                                                                                    item,
                                                                                ) =>
                                                                                    item.is_active,
                                                                            );
                                                                        const cleanGroupTitle =
                                                                            group.name
                                                                                .trim()
                                                                                .toLowerCase()
                                                                                .startsWith(
                                                                                    'pilih',
                                                                                )
                                                                                ? group.name.trim()
                                                                                : `Pilih ${group.name.trim()}`;

                                                                        return (
                                                                            <div
                                                                                key={
                                                                                    group.id
                                                                                }
                                                                                className="space-y-1.5"
                                                                            >
                                                                                <div className="flex items-center justify-between gap-2">
                                                                                    <div className="flex min-w-0 items-center gap-1.5">
                                                                                        <CupHeaderPhosphorIcon className="size-3.5 shrink-0 text-[#4A2C18]" />
                                                                                        <span className="truncate text-[11.5px] font-bold text-[#1A1A1A]">
                                                                                            {
                                                                                                cleanGroupTitle
                                                                                            }
                                                                                        </span>
                                                                                    </div>

                                                                                    {isSingle ? (
                                                                                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#FDECEB] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#C52828]">
                                                                                            <Flame
                                                                                                weight="fill"
                                                                                                className="size-2.5 text-[#C52828]"
                                                                                            />
                                                                                            <span>
                                                                                                Paling
                                                                                                Favorit
                                                                                            </span>
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="shrink-0 rounded-md bg-[#EFEADF] px-1.5 py-0.5 text-[9.5px] font-medium text-[#5E5850]">
                                                                                            Bisa
                                                                                            Banyak
                                                                                            {group.is_required &&
                                                                                                ' • Wajib'}
                                                                                        </span>
                                                                                    )}
                                                                                </div>

                                                                                {isSingle ? (
                                                                                    <div
                                                                                        className={cn(
                                                                                            'grid gap-1.5 sm:gap-2',
                                                                                            activeItems.length ===
                                                                                                1
                                                                                                ? 'grid-cols-1'
                                                                                                : 'grid-cols-2',
                                                                                        )}
                                                                                    >
                                                                                        {activeItems.map(
                                                                                            (
                                                                                                item,
                                                                                                itemIdx,
                                                                                            ) => {
                                                                                                const isChecked =
                                                                                                    selectedOptionIds.includes(
                                                                                                        item.id,
                                                                                                    );
                                                                                                const addPrice =
                                                                                                    parseFloat(
                                                                                                        item.additional_price,
                                                                                                    ) ||
                                                                                                    0;
                                                                                                const fullSizePrice =
                                                                                                    baseMenuPrice +
                                                                                                    addPrice;

                                                                                                return (
                                                                                                    <button
                                                                                                        key={
                                                                                                            item.id
                                                                                                        }
                                                                                                        type="button"
                                                                                                        onClick={() =>
                                                                                                            handleToggleOption(
                                                                                                                group,
                                                                                                                item,
                                                                                                            )
                                                                                                        }
                                                                                                        className={cn(
                                                                                                            'relative flex cursor-pointer items-center gap-1.5 rounded-xl px-2.5 py-2 pr-5 text-left transition-all',
                                                                                                            isChecked
                                                                                                                ? 'border-[1.5px] border-[#C52828] bg-white shadow-xs'
                                                                                                                : 'border border-[#E8E2D9] bg-[#F5F1E9]/85 hover:bg-[#EFEADF]',
                                                                                                        )}
                                                                                                    >
                                                                                                        {isChecked && (
                                                                                                            <span className="absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full bg-[#C52828] text-white">
                                                                                                                <Check
                                                                                                                    weight="bold"
                                                                                                                    className="size-2"
                                                                                                                />
                                                                                                            </span>
                                                                                                        )}

                                                                                                        <SizeOptionIcon
                                                                                                            icon={
                                                                                                                item.icon
                                                                                                            }
                                                                                                            name={
                                                                                                                item.name
                                                                                                            }
                                                                                                            index={
                                                                                                                itemIdx
                                                                                                            }
                                                                                                            containerClassName="size-7 origin-center scale-[0.8] items-center"
                                                                                                        />

                                                                                                        <div className="min-w-0 flex-1">
                                                                                                            <span className="line-clamp-2 text-[10.5px] leading-tight font-semibold text-[#3F3A34]">
                                                                                                                {
                                                                                                                    item.name
                                                                                                                }
                                                                                                            </span>
                                                                                                            <span className="mt-0.5 block text-[11px] leading-tight font-bold whitespace-nowrap text-[#1A1A1A] tabular-nums">
                                                                                                                {formatRupiah(
                                                                                                                    fullSizePrice,
                                                                                                                )}
                                                                                                            </span>
                                                                                                        </div>
                                                                                                    </button>
                                                                                                );
                                                                                            },
                                                                                        )}
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                                                                        {activeItems.map(
                                                                                            (
                                                                                                item,
                                                                                                itemIdx,
                                                                                            ) => {
                                                                                                const isChecked =
                                                                                                    selectedOptionIds.includes(
                                                                                                        item.id,
                                                                                                    );
                                                                                                const addPrice =
                                                                                                    parseFloat(
                                                                                                        item.additional_price,
                                                                                                    ) ||
                                                                                                    0;

                                                                                                return (
                                                                                                    <button
                                                                                                        key={
                                                                                                            item.id
                                                                                                        }
                                                                                                        type="button"
                                                                                                        onClick={() =>
                                                                                                            handleToggleOption(
                                                                                                                group,
                                                                                                                item,
                                                                                                            )
                                                                                                        }
                                                                                                        className={cn(
                                                                                                            'relative flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition-all',
                                                                                                            isChecked
                                                                                                                ? 'border-[1.5px] border-[#C52828] bg-white'
                                                                                                                : 'border border-[#E8E2D9] bg-[#F5F1E9]/85 hover:bg-[#EFEADF]',
                                                                                                        )}
                                                                                                    >
                                                                                                        <div className="flex min-w-0 items-center gap-2">
                                                                                                            {item.icon ? (
                                                                                                                <SizeOptionIcon
                                                                                                                    icon={
                                                                                                                        item.icon
                                                                                                                    }
                                                                                                                    name={
                                                                                                                        item.name
                                                                                                                    }
                                                                                                                    index={
                                                                                                                        itemIdx
                                                                                                                    }
                                                                                                                    containerClassName="size-5 items-center"
                                                                                                                    className="size-3.5"
                                                                                                                />
                                                                                                            ) : (
                                                                                                                <Checkbox
                                                                                                                    checked={
                                                                                                                        isChecked
                                                                                                                    }
                                                                                                                    className="pointer-events-none rounded-md"
                                                                                                                />
                                                                                                            )}
                                                                                                            <span className="truncate text-[10.5px] font-semibold text-[#1A1A1A]">
                                                                                                                {
                                                                                                                    item.name
                                                                                                                }
                                                                                                            </span>
                                                                                                        </div>
                                                                                                        <span className="shrink-0 text-[10.5px] font-bold whitespace-nowrap text-[#C52828] tabular-nums">
                                                                                                            {addPrice >
                                                                                                            0
                                                                                                                ? `+${formatRupiah(addPrice)}`
                                                                                                                : 'Gratis'}
                                                                                                        </span>
                                                                                                    </button>
                                                                                                );
                                                                                            },
                                                                                        )}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    },
                                                                )}
                                                            </div>
                                                        )}

                                                    {/* Catatan Khusus (Opsional) */}
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <PencilSimpleLine
                                                                weight="regular"
                                                                className="size-3.5 text-[#4A2C18]"
                                                            />
                                                            <Label
                                                                htmlFor="cust_notes"
                                                                className="cursor-pointer text-[11.5px] font-bold text-[#1A1A1A]"
                                                            >
                                                                Catatan Khusus
                                                                (Opsional)
                                                            </Label>
                                                        </div>
                                                        <input
                                                            id="cust_notes"
                                                            type="text"
                                                            value={
                                                                customizeNotes
                                                            }
                                                            onChange={(e) =>
                                                                setCustomizeNotes(
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="Misal: Less ice, jangan terlalu manis..."
                                                            className="h-9 w-full rounded-xl border border-[#E6DFD3] bg-[#F3EFE6] px-3 text-[11.5px] font-normal text-[#1A1A1A] transition outline-none placeholder:text-[#8C857B] focus:border-[#C52828] focus:bg-white"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sticky Footer Action Bar */}
                                            <div className="sticky bottom-0 z-20 shrink-0 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 p-2.5 backdrop-blur-md sm:p-3">
                                                <div className="flex items-center gap-2">
                                                    {editingCartId !== null && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                removeCartItem(
                                                                    editingCartId,
                                                                );
                                                                setEditingCartId(
                                                                    null,
                                                                );
                                                                setIsCustomizeOpen(
                                                                    false,
                                                                );
                                                                toast.success(
                                                                    'Item dihapus dari keranjang.',
                                                                );
                                                            }}
                                                            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 active:scale-95"
                                                            title="Hapus item dari keranjang"
                                                        >
                                                            <Trash
                                                                weight="bold"
                                                                className="size-3.5"
                                                            />
                                                        </button>
                                                    )}

                                                    {/* Compact Stepper */}
                                                    <div className="flex h-9 shrink-0 items-center rounded-xl border border-[#E6DFD3] bg-[#F3EFE6] px-1">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setCustomizeQty(
                                                                    Math.max(
                                                                        1,
                                                                        customizeQty -
                                                                            1,
                                                                    ),
                                                                )
                                                            }
                                                            aria-label="Kurangi jumlah"
                                                            className="flex size-6 cursor-pointer items-center justify-center rounded-lg text-[#3F3A34] transition hover:bg-[#E7E0D3] active:scale-90"
                                                        >
                                                            <PhMinus
                                                                weight="bold"
                                                                className="size-2.5"
                                                            />
                                                        </button>
                                                        <span className="w-5 text-center text-xs font-bold text-[#1A1A1A] tabular-nums">
                                                            {customizeQty}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            disabled={
                                                                customizeQty >=
                                                                Math.min(
                                                                    50,
                                                                    activeRemainingStock,
                                                                )
                                                            }
                                                            onClick={() =>
                                                                setCustomizeQty(
                                                                    Math.min(
                                                                        50,
                                                                        activeRemainingStock,
                                                                        customizeQty +
                                                                            1,
                                                                    ),
                                                                )
                                                            }
                                                            aria-label="Tambah jumlah"
                                                            className="flex size-6 cursor-pointer items-center justify-center rounded-lg text-[#3F3A34] transition hover:bg-[#E7E0D3] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
                                                        >
                                                            <PhPlus
                                                                weight="bold"
                                                                className="size-2.5"
                                                            />
                                                        </button>
                                                    </div>

                                                    {/* Tombol Simpan / Tambah */}
                                                    <button
                                                        type="button"
                                                        disabled={
                                                            activeRemainingStock <=
                                                            0
                                                        }
                                                        onClick={
                                                            handleSaveFromModal
                                                        }
                                                        className="flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-between gap-2 rounded-xl bg-[#C52828] px-3 font-semibold text-white shadow-[0_4px_12px_rgba(197,40,40,0.25)] transition hover:bg-[#B02222] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                                                    >
                                                        <span className="truncate text-[11.5px] font-bold">
                                                            {editingCartId !==
                                                            null
                                                                ? 'Simpan'
                                                                : 'Tambah ke Keranjang'}
                                                        </span>
                                                        <span className="shrink-0 text-[11.5px] font-extrabold whitespace-nowrap tabular-nums">
                                                            {formatRupiah(
                                                                unitPrice *
                                                                    customizeQty,
                                                            )}
                                                        </span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                        </DialogContent>
                    </Dialog>

                    {/* ========================================================================= */}
                    {/* MODAL 2: KERANJANG BELANJA & CHECKOUT PESANAN                             */}
                    {/* ========================================================================= */}
                    <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
                        <DialogContent className="flex max-h-[86dvh] w-[calc(100%-1.5rem)] max-w-[356px] flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-[400px] [&>button:last-child]:hidden">
                            <form
                                onSubmit={handleCheckout}
                                className="flex h-full max-h-[86dvh] flex-col overflow-hidden"
                            >
                                {/* Header Modal Keranjang (Sticky Top) */}
                                <div className="z-20 flex shrink-0 items-start justify-between gap-2.5 border-b border-[#EBE5DC] bg-[#FAF8F4] px-3.5 pt-3.5 pb-2.5 sm:px-4">
                                    <DialogHeader className="space-y-0.5 text-left">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <div className="flex size-6.5 items-center justify-center rounded-lg bg-[#FDECEB] text-[#C52828]">
                                                <ShoppingBagOpen
                                                    weight="duotone"
                                                    className="size-3.5"
                                                />
                                            </div>
                                            <DialogTitle className="text-[15px] font-bold tracking-tight text-[#1A1A1A] sm:text-base">
                                                Rincian Pesanan
                                            </DialogTitle>
                                            <span className="rounded-md bg-[#1A1A1A] px-1.5 py-0.5 text-[9px] font-bold text-white">
                                                MEJA {table.table_number}
                                            </span>
                                        </div>
                                        <DialogDescription className="text-[11px] leading-snug font-normal text-[#6E6A64]">
                                            Periksa kembali ukuran, jumlah, dan
                                            catatan sebelum pesanan diteruskan
                                            ke barista.
                                        </DialogDescription>
                                    </DialogHeader>

                                    <button
                                        type="button"
                                        onClick={() => setIsCartOpen(false)}
                                        aria-label="Tutup keranjang"
                                        className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-[#EFECE6] text-[#1A1A1A] transition hover:bg-[#E5E0D6] active:scale-95"
                                    >
                                        <PhX
                                            weight="bold"
                                            className="size-3.5"
                                        />
                                    </button>
                                </div>

                                {/* Body Konten Keranjang & Checkout (Scrollable) */}
                                <div className="flex-1 space-y-3 overflow-x-hidden overflow-y-auto p-3.5 sm:p-4">
                                    {/* Daftar Item di Keranjang */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <CupHeaderPhosphorIcon className="size-3.5 text-[#4A2C18]" />
                                                <span className="text-[11.5px] font-bold text-[#1A1A1A]">
                                                    Daftar Menu Dipesan
                                                </span>
                                            </div>
                                            <span className="rounded-full bg-[#FDECEB] px-2 py-0.5 text-[9.5px] font-semibold text-[#C52828]">
                                                {totalCartItems} Item
                                            </span>
                                        </div>

                                        <div className="space-y-1.5">
                                            {cart.map((item) => {
                                                const variantNames =
                                                    item.selected_options
                                                        .map(
                                                            (o) =>
                                                                o.option_name,
                                                        )
                                                        .join(', ');
                                                const menuForCart =
                                                    allMenusMap.get(
                                                        item.menu_id,
                                                    );
                                                const remainingExtraForCart =
                                                    menuForCart
                                                        ? getRemainingStockForMenu(
                                                              menuForCart,
                                                          )
                                                        : 50;

                                                return (
                                                    <div
                                                        key={item.cart_id}
                                                        className="space-y-1.5 rounded-xl border border-[#E8E2D9] bg-white p-2.5 shadow-xs transition hover:border-[#DECFC0]"
                                                    >
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div className="min-w-0 flex-1">
                                                                <h4 className="text-xs leading-snug font-bold tracking-tight text-[#1A1A1A]">
                                                                    {
                                                                        item.menu_name
                                                                    }
                                                                    {variantNames
                                                                        ? ` — ${variantNames}`
                                                                        : ''}
                                                                </h4>
                                                                <div className="flex flex-wrap items-center gap-1.5">
                                                                    <span className="text-[10.5px] font-medium text-[#7C756B] tabular-nums">
                                                                        {
                                                                            item.quantity
                                                                        }{' '}
                                                                        &times;{' '}
                                                                        {formatRupiah(
                                                                            item.unit_price,
                                                                        )}
                                                                    </span>
                                                                    {menuForCart?.is_limited_stock && (
                                                                        <span className="rounded-[4px] border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] leading-none font-bold text-amber-800 tabular-nums">
                                                                            Sisa{' '}
                                                                            {menuForCart.stock_quantity ??
                                                                                0}{' '}
                                                                            porsi
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <span className="shrink-0 text-xs font-bold whitespace-nowrap text-[#C52828] tabular-nums">
                                                                {formatRupiah(
                                                                    item.unit_price *
                                                                        item.quantity,
                                                                )}
                                                            </span>
                                                        </div>

                                                        {item.selected_options
                                                            .length > 0 && (
                                                            <div className="flex flex-wrap gap-1">
                                                                {item.selected_options.map(
                                                                    (o) => (
                                                                        <span
                                                                            key={
                                                                                o.option_item_id
                                                                            }
                                                                            className="inline-flex items-center rounded-md border border-[#E8E2D9] bg-[#F8F5EE] px-1.5 py-0.5 text-[9px] font-medium text-[#4A4036]"
                                                                        >
                                                                            {
                                                                                o.group_name
                                                                            }
                                                                            :{' '}
                                                                            {
                                                                                o.option_name
                                                                            }
                                                                            {o.additional_price >
                                                                            0
                                                                                ? ` (+${formatRupiah(o.additional_price)})`
                                                                                : ''}
                                                                        </span>
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}

                                                        {item.customer_notes && (
                                                            <div className="flex items-start gap-1.5 rounded-lg border border-[#EBE3D6] bg-[#F8F5EE] px-2 py-1 text-[10px] text-[#5E5850]">
                                                                <PencilSimpleLine
                                                                    weight="regular"
                                                                    className="mt-0.5 size-3 shrink-0 text-[#4A2C18]"
                                                                />
                                                                <span className="leading-tight italic">
                                                                    &ldquo;
                                                                    {
                                                                        item.customer_notes
                                                                    }
                                                                    &rdquo;
                                                                </span>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between border-t border-[#F2ECE3] pt-1.5">
                                                            <div className="flex items-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        openEditCartItem(
                                                                            item,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-[#F5EFE6] px-2 py-1 text-[10.5px] font-semibold text-[#3F3A34] transition hover:bg-[#EBE2D4] active:scale-95"
                                                                >
                                                                    <NotePencil
                                                                        weight="bold"
                                                                        className="size-3 text-[#4A2C18]"
                                                                    />
                                                                    <span>
                                                                        {item
                                                                            .selected_options
                                                                            .length >
                                                                        0
                                                                            ? 'Ubah Ukuran'
                                                                            : 'Ubah Catatan'}
                                                                    </span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        removeCartItem(
                                                                            item.cart_id,
                                                                        )
                                                                    }
                                                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[#C52828] transition hover:bg-red-50 active:scale-95"
                                                                >
                                                                    <Trash
                                                                        weight="bold"
                                                                        className="size-3"
                                                                    />
                                                                    <span>
                                                                        Hapus
                                                                    </span>
                                                                </button>
                                                            </div>

                                                            {/* Compact Stepper */}
                                                            <div className="flex h-6.5 items-center rounded-lg border border-[#E4DCD0] bg-[#F7F4EE] px-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        updateCartQty(
                                                                            item.cart_id,
                                                                            -1,
                                                                        )
                                                                    }
                                                                    className="flex size-5 cursor-pointer items-center justify-center rounded text-[#3F3A34] transition hover:bg-[#EAE2D4] active:scale-90"
                                                                >
                                                                    <PhMinus
                                                                        weight="bold"
                                                                        className="size-2.5"
                                                                    />
                                                                </button>
                                                                <span className="w-5 text-center text-[11px] font-bold text-[#1A1A1A] tabular-nums">
                                                                    {
                                                                        item.quantity
                                                                    }
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    disabled={
                                                                        remainingExtraForCart <=
                                                                        0
                                                                    }
                                                                    onClick={() =>
                                                                        updateCartQty(
                                                                            item.cart_id,
                                                                            1,
                                                                        )
                                                                    }
                                                                    className="flex size-5 cursor-pointer items-center justify-center rounded text-[#3F3A34] transition hover:bg-[#EAE2D4] active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
                                                                >
                                                                    <PhPlus
                                                                        weight="bold"
                                                                        className="size-2.5"
                                                                    />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="h-px w-full bg-[#EBE5DC]" />

                                    {/* Form Identitas Pemesan & Catatan Meja */}
                                    <div className="space-y-2.5">
                                        <div className="space-y-1">
                                            <label
                                                htmlFor="cust_name"
                                                className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#1A1A1A]"
                                            >
                                                <PhUser
                                                    weight="bold"
                                                    className="size-3.5 text-[#4A2C18]"
                                                />
                                                <span>
                                                    Nama Pemesan{' '}
                                                    <span className="text-[#C52828]">
                                                        *
                                                    </span>
                                                </span>
                                            </label>
                                            <input
                                                id="cust_name"
                                                type="text"
                                                value={customerName}
                                                onChange={(e) =>
                                                    setCustomerName(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Contoh: Budi, Titan, dsb."
                                                required
                                                autoFocus
                                                className="h-9 w-full rounded-xl border border-[#E4DCD0] bg-[#F7F4EE] px-3 text-[11.5px] font-medium text-[#1A1A1A] transition outline-none placeholder:text-[#8C857B] focus:border-[#C52828] focus:bg-white"
                                            />
                                            <p className="pl-0.5 text-[10px] text-[#7C756B]">
                                                Nama ini akan dipanggil saat
                                                pesanan siap disajikan.
                                            </p>
                                        </div>

                                        <div className="space-y-1">
                                            <label
                                                htmlFor="order_notes"
                                                className="flex items-center gap-1.5 text-[11.5px] font-bold text-[#1A1A1A]"
                                            >
                                                <PencilSimpleLine
                                                    weight="regular"
                                                    className="size-3.5 text-[#4A2C18]"
                                                />
                                                <span>
                                                    Catatan Tambahan Meja
                                                    (Opsional)
                                                </span>
                                            </label>
                                            <input
                                                id="order_notes"
                                                type="text"
                                                value={orderNotes}
                                                onChange={(e) =>
                                                    setOrderNotes(
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="Misal: Sendok garpu dipisah, sedotan kertas..."
                                                className="h-9 w-full rounded-xl border border-[#E4DCD0] bg-[#F7F4EE] px-3 text-[11.5px] font-normal text-[#1A1A1A] transition outline-none placeholder:text-[#8C857B] focus:border-[#C52828] focus:bg-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="h-px w-full bg-[#EBE5DC]" />

                                    {/* PILIHAN METODE PEMBAYARAN */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[11px] font-bold text-[#1A1A1A]">
                                                Metode Pembayaran
                                            </Label>
                                            <span className="rounded-md bg-[#FDECEB] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#C52828]">
                                                {paymentPolicy.allow_xendit &&
                                                paymentPolicy.allow_cash
                                                    ? 'Pilih 1 Metode'
                                                    : paymentPolicy.allow_xendit ||
                                                        paymentPolicy.allow_cash
                                                      ? 'Tersedia 1 Metode'
                                                      : 'Nonaktif'}
                                            </span>
                                        </div>

                                        {!paymentPolicy.allow_xendit &&
                                        !paymentPolicy.allow_cash ? (
                                            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-[#C52828]">
                                                Semua metode pembayaran sedang
                                                dinonaktifkan oleh pengelola
                                                kafe. Silakan hubungi kasir.
                                            </div>
                                        ) : (
                                            <div
                                                className={cn(
                                                    'grid gap-1.5 sm:gap-2',
                                                    paymentPolicy.allow_xendit &&
                                                        paymentPolicy.allow_cash
                                                        ? 'grid-cols-2'
                                                        : 'grid-cols-1',
                                                )}
                                            >
                                                {/* Opsi 1: QRIS */}
                                                {paymentPolicy.allow_xendit && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPaymentMethod(
                                                                'qris',
                                                            )
                                                        }
                                                        className={cn(
                                                            'relative flex cursor-pointer flex-col justify-between rounded-xl p-2.5 text-left transition-all',
                                                            paymentMethod ===
                                                                'qris'
                                                                ? 'border-[1.5px] border-[#C52828] bg-white shadow-xs'
                                                                : 'border border-[#E4DCD0] bg-[#F7F4EE] hover:bg-[#EFE9DF]',
                                                        )}
                                                    >
                                                        {paymentMethod ===
                                                            'qris' && (
                                                            <span className="absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full bg-[#C52828] text-white">
                                                                <Check
                                                                    weight="bold"
                                                                    className="size-2"
                                                                />
                                                            </span>
                                                        )}

                                                        <div className="flex items-center gap-1.5 pr-4">
                                                            <div
                                                                className={cn(
                                                                    'flex size-6.5 shrink-0 items-center justify-center rounded-lg transition-colors',
                                                                    paymentMethod ===
                                                                        'qris'
                                                                        ? 'bg-[#C52828] text-white'
                                                                        : 'bg-[#E8E2D8] text-[#4A2C18]',
                                                                )}
                                                            >
                                                                <PhQrCode
                                                                    weight="bold"
                                                                    className="size-3.5"
                                                                />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-[11.5px] leading-tight font-bold text-[#1A1A1A]">
                                                                    QRIS
                                                                </div>
                                                                <div className="mt-0.5 truncate text-[9.5px] font-medium text-[#7C756B]">
                                                                    Batas waktu:{' '}
                                                                    {
                                                                        paymentPolicy.expiry_minutes
                                                                    }{' '}
                                                                    mnt
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <p className="mt-1.5 text-[9.5px] leading-tight text-[#7C756B]">
                                                            GoPay, OVO, Dana,
                                                            BCA, Mandiri dsb.
                                                        </p>
                                                    </button>
                                                )}

                                                {/* Opsi 2: Tunai Kasir */}
                                                {paymentPolicy.allow_cash && (
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPaymentMethod(
                                                                'cash',
                                                            )
                                                        }
                                                        className={cn(
                                                            'relative flex cursor-pointer flex-col justify-between rounded-xl p-2.5 text-left transition-all',
                                                            paymentMethod ===
                                                                'cash'
                                                                ? 'border-[1.5px] border-[#C52828] bg-white shadow-xs'
                                                                : 'border border-[#E4DCD0] bg-[#F7F4EE] hover:bg-[#EFE9DF]',
                                                        )}
                                                    >
                                                        {paymentMethod ===
                                                            'cash' && (
                                                            <span className="absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full bg-[#C52828] text-white">
                                                                <Check
                                                                    weight="bold"
                                                                    className="size-2"
                                                                />
                                                            </span>
                                                        )}

                                                        <div className="flex items-center gap-1.5 pr-4">
                                                            <div
                                                                className={cn(
                                                                    'flex size-6.5 shrink-0 items-center justify-center rounded-lg transition-colors',
                                                                    paymentMethod ===
                                                                        'cash'
                                                                        ? 'bg-[#C52828] text-white'
                                                                        : 'bg-[#E8E2D8] text-[#4A2C18]',
                                                                )}
                                                            >
                                                                <Money
                                                                    weight="bold"
                                                                    className="size-3.5"
                                                                />
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-[11.5px] leading-tight font-bold text-[#1A1A1A]">
                                                                    Tunai
                                                                </div>
                                                                <div className="mt-0.5 truncate text-[9.5px] font-medium text-[#7C756B]">
                                                                    Bayar di
                                                                    Kasir
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <p className="mt-1.5 text-[9.5px] leading-tight text-[#7C756B]">
                                                            Kirim sekarang,
                                                            bayar cash di kasir.
                                                        </p>
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Info Box */}
                                        <div className="rounded-xl border border-[#E6DFD3] bg-[#F7F4EE] p-2 text-[10.5px] text-[#3F3A34]">
                                            <div className="flex items-center gap-1.5 font-bold text-[#1A1A1A]">
                                                {paymentMethod === 'qris' ? (
                                                    <>
                                                        <PhQrCode
                                                            weight="bold"
                                                            className="size-3 text-[#C52828]"
                                                        />
                                                        <span>
                                                            {activeOrder
                                                                ? `Digabung ke Pesanan #${activeOrder.order_number} (QRIS)`
                                                                : 'Pembayaran QRIS Instan'}
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Money
                                                            weight="bold"
                                                            className="size-3 text-[#4A2C18]"
                                                        />
                                                        <span>
                                                            {activeOrder
                                                                ? `Digabung ke Pesanan #${activeOrder.order_number} (Tunai)`
                                                                : 'Pembayaran Tunai di Meja Kasir'}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                            <p className="mt-0.5 text-[10px] leading-snug text-[#7C756B]">
                                                {paymentMethod === 'qris'
                                                    ? 'Setelah kirim, kode QRIS otomatis tampil di layar HP untuk di-scan.'
                                                    : 'Setelah kirim, silakan sebutkan nama pemesan di meja kasir untuk membayar.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Sticky Footer Checkout Action Bar */}
                                <div className="z-20 shrink-0 space-y-1.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 p-2.5 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] backdrop-blur-md sm:p-3">
                                    {activeOrder && (
                                        <div className="space-y-1 rounded-xl border border-[#E8E2D9] bg-white p-2 text-[11px]">
                                            <div className="flex items-center justify-between text-[#7C756B]">
                                                <span>
                                                    Tagihan Sebelumnya (#
                                                    {activeOrder.order_number})
                                                </span>
                                                <span className="font-semibold text-[#1A1A1A] tabular-nums">
                                                    {formatRupiah(
                                                        activeOrder.total_amount,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between font-semibold text-[#3F3A34]">
                                                <span>
                                                    Menu Baru ({totalCartItems}{' '}
                                                    item)
                                                </span>
                                                <span className="font-bold text-[#C52828] tabular-nums">
                                                    +
                                                    {formatRupiah(
                                                        totalCartPrice,
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between border-t border-[#EBE5DC] pt-1 text-[11.5px] font-bold text-[#1A1A1A]">
                                                <span>Total Gabungan</span>
                                                <span className="text-xs font-bold text-[#C52828] tabular-nums sm:text-[13px]">
                                                    {formatRupiah(
                                                        activeOrder.total_amount +
                                                            totalCartPrice,
                                                    )}
                                                </span>
                                            </div>
                                            {activeOrder.settled_amount > 0 && (
                                                <div className="space-y-0.5 border-t border-dashed border-[#E6DFD3] pt-1 text-[10.5px]">
                                                    <div className="flex items-center justify-between font-semibold text-emerald-700">
                                                        <span>
                                                            Sudah Dibayar
                                                        </span>
                                                        <span className="tabular-nums">
                                                            {formatRupiah(
                                                                activeOrder.settled_amount,
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between font-bold text-[#C52828]">
                                                        <span>
                                                            Sisa Tagihan
                                                            Tambahan
                                                        </span>
                                                        <span className="tabular-nums">
                                                            {formatRupiah(
                                                                Math.max(
                                                                    0,
                                                                    activeOrder.total_amount +
                                                                        totalCartPrice -
                                                                        activeOrder.settled_amount,
                                                                ),
                                                            )}
                                                        </span>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <div className="min-w-0 pr-1">
                                            <span className="block text-[9px] font-bold tracking-wider text-[#7C756B] uppercase">
                                                {activeOrder &&
                                                activeOrder.settled_amount > 0
                                                    ? 'Sisa Bayar'
                                                    : 'Total'}
                                            </span>
                                            <span className="block text-sm leading-tight font-black whitespace-nowrap text-[#C52828] tabular-nums sm:text-[15px]">
                                                {formatRupiah(
                                                    activeOrder &&
                                                        activeOrder.settled_amount >
                                                            0
                                                        ? Math.max(
                                                              0,
                                                              activeOrder.total_amount +
                                                                  totalCartPrice -
                                                                  activeOrder.settled_amount,
                                                          )
                                                        : totalCartPrice,
                                                )}
                                            </span>
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={
                                                isSubmitting ||
                                                cart.length === 0 ||
                                                (!paymentPolicy.allow_xendit &&
                                                    !paymentPolicy.allow_cash)
                                            }
                                            className="flex h-9 min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#C52828] px-3 text-[11.5px] font-bold text-white shadow-[0_4px_12px_rgba(197,40,40,0.25)] transition hover:bg-[#B02222] active:scale-[0.99] disabled:opacity-50"
                                        >
                                            {isSubmitting ? (
                                                <span>Mengirim Pesanan...</span>
                                            ) : (
                                                <>
                                                    {paymentMethod ===
                                                    'qris' ? (
                                                        <PhQrCode
                                                            weight="bold"
                                                            className="size-3.5 shrink-0"
                                                        />
                                                    ) : (
                                                        <Money
                                                            weight="bold"
                                                            className="size-3.5 shrink-0"
                                                        />
                                                    )}
                                                    <span className="truncate">
                                                        {activeOrder
                                                            ? `Kirim (#${activeOrder.order_number})`
                                                            : paymentMethod ===
                                                                'qris'
                                                              ? 'Kirim & Bayar QRIS'
                                                              : 'Kirim Pesanan'}
                                                    </span>
                                                    <PhArrowRight
                                                        weight="bold"
                                                        className="size-3 shrink-0"
                                                    />
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
        </>
    );
}
