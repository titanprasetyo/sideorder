import { Head, Link, router } from '@inertiajs/react';
import {
    AlertCircle,
    ArrowRight,
    Bell,
    Check,
    CheckCircle2,
    Coffee,
    Image as ImageIcon,
    Minus,
    Pencil,
    Plus,
    Search,
    ShoppingBag,
    SlidersHorizontal,
    Store,
    Trash2,
    Utensils,
    Wifi,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface OptionItem {
    id: number;
    name: string;
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
    is_active: boolean;
    option_groups?: OptionGroup[];
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
            menu.option_groups.some((g) => g.option_items && g.option_items.length > 0),
    );
}

function buildCartId(menuId: number, optionIds: number[], notes: string): string {
    const sortedIds = [...optionIds].sort((a, b) => a - b);
    return `${menuId}-${sortedIds.join('_')}-${notes.trim()}`;
}

function hydrateCartFromStorage(qrToken: string, categories: Category[]): CartItem[] {
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
                if (m.is_active) {
                    menuMap.set(m.id, m);
                }
            });
        });

        const synced: CartItem[] = [];

        parsed.forEach((rawItem: any) => {
            const menu = menuMap.get(Number(rawItem?.menu_id));
            if (!menu) return;

            const qty = Math.max(1, Math.min(50, Number(rawItem?.quantity) || 1));
            const notes = typeof rawItem?.customer_notes === 'string' ? rawItem.customer_notes.trim() : '';

            // Ambil ID opsi dari struktur baru (selected_options) maupun struktur lama (selected_option_ids)
            const rawOptionIds: number[] = Array.isArray(rawItem?.selected_options)
                ? rawItem.selected_options
                      .map((o: any) => Number(o?.option_item_id ?? o?.id))
                      .filter((n: number) => !Number.isNaN(n) && n > 0)
                : Array.isArray(rawItem?.selected_option_ids)
                  ? rawItem.selected_option_ids
                        .map((id: any) => Number(id))
                        .filter((n: number) => !Number.isNaN(n) && n > 0)
                  : [];

            const validOptions: CartOption[] = [];
            let optionsPrice = 0;

            if (menu.option_groups) {
                menu.option_groups.forEach((group) => {
                    const matchedInGroup = group.option_items.filter(
                        (opt) => opt.is_active && rawOptionIds.includes(opt.id),
                    );

                    const chosenItems = isSingleSelectGroup(group)
                        ? matchedInGroup.slice(0, 1)
                        : matchedInGroup;

                    // Jika grup wajib belum terpilih pada data lama, pilih default/pertama
                    if (
                        chosenItems.length === 0 &&
                        group.is_required &&
                        isSingleSelectGroup(group) &&
                        group.option_items.length > 0
                    ) {
                        const fallback =
                            group.option_items.find((i) => i.is_default && i.is_active) ||
                            group.option_items[0];
                        if (fallback) {
                            chosenItems.push(fallback);
                        }
                    }

                    chosenItems.forEach((opt) => {
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

            const basePrice = parseFloat(menu.base_price) || 0;
            const unitPrice = basePrice + optionsPrice;
            const optionIds = validOptions.map((o) => o.option_item_id);
            const cartId = buildCartId(menu.id, optionIds, notes);

            const existingIdx = synced.findIndex((c) => c.cart_id === cartId);
            if (existingIdx > -1) {
                synced[existingIdx].quantity = Math.min(50, synced[existingIdx].quantity + qty);
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
    if (lower.includes('croissant') || lower.includes('pastry') || lower.includes('roti') || lower.includes('toast') || lower.includes('bakar')) {
        return 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?q=80&w=400&auto=format&fit=crop';
    }
    if (lower.includes('mie') || lower.includes('nasi') || lower.includes('makan') || lower.includes('tahu') || lower.includes('snack') || lower.includes('goreng')) {
        return 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?q=80&w=400&auto=format&fit=crop';
    }
    if (lower.includes('juice') || lower.includes('jeruk') || lower.includes('tea') || lower.includes('segar')) {
        return 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?q=80&w=400&auto=format&fit=crop';
    }
    // Default: Kopi Susu / Coffee
    return 'https://images.unsplash.com/photo-1541167760496-1628856ab772?q=80&w=400&auto=format&fit=crop';
}

// Penanda label estetis otomatis sesuai referensi mockup
function getMenuBadge(menu: Menu, catName: string) {
    const lower = `${menu.name} ${catName}`.toLowerCase();
    if (lower.includes('aren') || lower.includes('kopi susu')) {
        return { label: 'BESTSELLER', sub: 'Iced 16oz', bg: 'bg-[#FEF0C7]', text: 'text-[#B54708]' };
    }
    if (lower.includes('americano') || lower.includes('espresso')) {
        return { label: 'Espresso Blend', sub: 'Single Origin', bg: 'bg-[#FEE4E2]', text: 'text-[#B42318]' };
    }
    if (lower.includes('matcha')) {
        return { label: 'Ceremonial Grade', sub: 'Pure Japan', bg: 'bg-[#D1FADF]', text: 'text-[#027A48]' };
    }
    if (lower.includes('croissant')) {
        return { label: 'Fresh Baked', sub: 'Artisan', bg: 'bg-[#FEF0C7]', text: 'text-[#B54708]' };
    }
    if (lower.includes('roti') || lower.includes('bakar')) {
        return { label: 'FAVORIT', sub: 'Sweet Bite', bg: 'bg-[#FEF0C7]', text: 'text-[#B54708]' };
    }
    if (lower.includes('mie') || lower.includes('matah') || lower.includes('pedas')) {
        return { label: 'Pedas Segar', sub: 'Main Dish', bg: 'bg-[#FEE4E2]', text: 'text-[#B42318]' };
    }
    if (lower.includes('tahu') || lower.includes('snack') || lower.includes('cemilan')) {
        return { label: 'Stok Terbatas', sub: 'Cemilan', bg: 'bg-[#FEF0C7]', text: 'text-[#B54708]' };
    }
    return { label: catName, sub: 'Signature', bg: 'bg-[#FEF0C7]', text: 'text-[#B54708]' };
}

export default function CustomerOrder({
    table,
    categories,
    activeOrder = null,
    lockedOrderNotice = null,
}: Props) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');

    // Peta seluruh menu aktif berdasarkan ID untuk lookup cepat & sinkronisasi harga
    const allMenusMap = useMemo(() => {
        const map = new Map<number, Menu>();
        categories.forEach((cat) => {
            cat.menus.forEach((m) => {
                map.set(m.id, m);
            });
        });
        return map;
    }, [categories]);

    // State Modal Kustomisasi / Edit Item
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const [activeMenu, setActiveMenu] = useState<Menu | null>(null);
    const [editingCartId, setEditingCartId] = useState<string | null>(null);
    const [customizeQty, setCustomizeQty] = useState(1);
    const [customizeNotes, setCustomizeNotes] = useState('');
    const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);

    // State Keranjang Belanja (lazy-initialized dari localStorage & disinkronkan dengan data menu server)
    const [cart, setCart] = useState<CartItem[]>(() =>
        hydrateCartFromStorage(table.qr_token, categories),
    );
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [customerName, setCustomerName] = useState(
        () => activeOrder?.customer_name || '',
    );
    const [orderNotes, setOrderNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

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
        if (!activeOrder) return;

        const interval = setInterval(() => {
            router.reload({ only: ['activeOrder', 'lockedOrderNotice'] });
        }, 5000);

        return () => clearInterval(interval);
    }, [activeOrder?.order_number]);

    // Sinkronkan ulang jika token meja berubah
    useEffect(() => {
        setCart(hydrateCartFromStorage(table.qr_token, categories));
    }, [table.qr_token, categories]);

    // Simpan otomatis ke localStorage setiap keranjang berubah & reset idempotency key
    useEffect(() => {
        localStorage.setItem(`sideorder_cart_${table.qr_token}`, JSON.stringify(cart));
        idempotencyKeyRef.current = '';
    }, [cart, table.qr_token]);

    // Reset lock modal saat modal dibuka/ditutup
    useEffect(() => {
        if (!isCustomizeOpen) {
            modalSubmitLockRef.current = false;
        }
    }, [isCustomizeOpen]);

    const formatRupiah = (amount: number | string) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
    };

    // Buka Modal Pemilihan Ukuran/Varian untuk tambah item baru
    const openCustomize = (menu: Menu) => {
        setEditingCartId(null);
        setActiveMenu(menu);
        setCustomizeQty(1);
        setCustomizeNotes('');

        // Pre-select default options dari database (hanya 1 untuk grup single-select)
        const defaults: number[] = [];
        if (menu.option_groups) {
            menu.option_groups.forEach((group) => {
                const activeItems = group.option_items.filter((i) => i.is_active);
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

        setSelectedOptionIds(defaults);
        setIsCustomizeOpen(true);
    };

    // Buka Modal Edit untuk item yang sudah ada di keranjang
    const openEditCartItem = (cartItem: CartItem) => {
        const menu = allMenusMap.get(cartItem.menu_id);
        if (!menu) {
            toast.error('Menu sudah tidak tersedia.');
            return;
        }

        setEditingCartId(cartItem.cart_id);
        setActiveMenu(menu);
        setCustomizeQty(cartItem.quantity);
        setCustomizeNotes(cartItem.customer_notes || '');
        setSelectedOptionIds(cartItem.selected_options.map((o) => o.option_item_id));
        setIsCustomizeOpen(true);
    };

    // Handler Tombol +Tambah pada kartu menu homepage
    const handleQuickAdd = (menu: Menu) => {
        // Jika produk memiliki varian ukuran/opsi, selalu buka modal pemilihan ukuran terlebih dahulu
        if (hasMenuVariants(menu)) {
            openCustomize(menu);
            return;
        }

        // Proteksi klik berulang (rapid double click) untuk produk tanpa varian
        const now = Date.now();
        const lastClick = quickAddLockRef.current[menu.id] ?? 0;
        if (now - lastClick < 320) {
            return;
        }
        quickAddLockRef.current[menu.id] = now;

        const cartId = buildCartId(menu.id, [], '');
        const basePrice = parseFloat(menu.base_price) || 0;

        setCart((prevCart) => {
            const existingIdx = prevCart.findIndex((c) => c.cart_id === cartId);
            if (existingIdx > -1) {
                const updated = [...prevCart];
                updated[existingIdx] = {
                    ...updated[existingIdx],
                    quantity: Math.min(50, updated[existingIdx].quantity + 1),
                };
                return updated;
            }

            return [
                ...prevCart,
                {
                    cart_id: cartId,
                    menu_id: menu.id,
                    menu_name: menu.name,
                    base_price: basePrice,
                    unit_price: basePrice,
                    quantity: 1,
                    customer_notes: '',
                    selected_options: [],
                },
            ];
        });

        toast.success(`Ditambahkan: ${menu.name}`);
    };

    // Handler Toggle Opsi di dalam Modal
    const handleToggleOption = (group: OptionGroup, item: OptionItem) => {
        if (isSingleSelectGroup(group)) {
            const groupItemIds = group.option_items.map((i) => i.id);
            setSelectedOptionIds((prev) => {
                const filtered = prev.filter((id) => !groupItemIds.includes(id));
                // Jika tidak wajib, mengklik opsi yang sedang terpilih dapat membatalkan pilihan
                if (!group.is_required && prev.includes(item.id)) {
                    return filtered;
                }
                return [...filtered, item.id];
            });
        } else {
            setSelectedOptionIds((prev) =>
                prev.includes(item.id)
                    ? prev.filter((id) => id !== item.id)
                    : [...prev, item.id],
            );
        }
    };

    // Hitung harga satuan item kustom berdasarkan harga dasar + varian terpilih
    const calculateCustomUnitPrice = (): number => {
        if (!activeMenu) return 0;
        let price = parseFloat(activeMenu.base_price) || 0;

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

        // Validasi grup opsi yang wajib dipilih (is_required)
        if (activeMenu.option_groups) {
            for (const group of activeMenu.option_groups) {
                const activeItems = group.option_items.filter((i) => i.is_active);
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

        modalSubmitLockRef.current = true;

        const optionsToStore: CartOption[] = [];
        if (activeMenu.option_groups) {
            activeMenu.option_groups.forEach((group) => {
                const matched = group.option_items.filter(
                    (item) => item.is_active && selectedOptionIds.includes(item.id),
                );
                const itemsToKeep = isSingleSelectGroup(group) ? matched.slice(0, 1) : matched;

                itemsToKeep.forEach((item) => {
                    optionsToStore.push({
                        group_name: group.name,
                        option_name: item.name,
                        additional_price: parseFloat(item.additional_price) || 0,
                        option_item_id: item.id,
                    });
                });
            });
        }

        const basePrice = parseFloat(activeMenu.base_price) || 0;
        const optionsSum = optionsToStore.reduce((s, o) => s + o.additional_price, 0);
        const unitPrice = basePrice + optionsSum;
        const normalizedNotes = customizeNotes.trim();
        const optionIds = optionsToStore.map((o) => o.option_item_id);
        const newCartId = buildCartId(activeMenu.id, optionIds, normalizedNotes);
        const qtyToSave = Math.max(1, Math.min(50, customizeQty));
        const optionLabelText =
            optionsToStore.length > 0
                ? ` (${optionsToStore.map((o) => o.option_name).join(', ')})`
                : '';

        if (editingCartId !== null) {
            // MODE EDIT ITEM DI KERANJANG
            setCart((prevCart) => {
                const editIdx = prevCart.findIndex((c) => c.cart_id === editingCartId);
                if (editIdx === -1) return prevCart;

                // Cek apakah setelah ukuran/catatan diubah, item menjadi identik dengan item lain di keranjang
                const duplicateIdx = prevCart.findIndex(
                    (c, idx) => c.cart_id === newCartId && idx !== editIdx,
                );

                if (duplicateIdx > -1) {
                    // Gabungkan kuantitas karena produk, ukuran/varian, dan catatan sama persis
                    return prevCart
                        .map((item, idx) => {
                            if (idx === duplicateIdx) {
                                return {
                                    ...item,
                                    base_price: basePrice,
                                    unit_price: unitPrice,
                                    quantity: Math.min(50, item.quantity + qtyToSave),
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
                    menu_id: activeMenu.id,
                    menu_name: activeMenu.name,
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
            toast.success(`Diperbarui: ${activeMenu.name}${optionLabelText}`);
        } else {
            // MODE TAMBAH BARU KE KERANJANG
            setCart((prevCart) => {
                const existingIdx = prevCart.findIndex((c) => c.cart_id === newCartId);
                if (existingIdx > -1) {
                    const updated = [...prevCart];
                    updated[existingIdx] = {
                        ...updated[existingIdx],
                        base_price: basePrice,
                        unit_price: unitPrice,
                        quantity: Math.min(50, updated[existingIdx].quantity + qtyToSave),
                        selected_options: optionsToStore,
                    };
                    return updated;
                }

                return [
                    ...prevCart,
                    {
                        cart_id: newCartId,
                        menu_id: activeMenu.id,
                        menu_name: activeMenu.name,
                        base_price: basePrice,
                        unit_price: unitPrice,
                        quantity: qtyToSave,
                        customer_notes: normalizedNotes,
                        selected_options: optionsToStore,
                    },
                ];
            });

            setIsCustomizeOpen(false);
            toast.success(`Ditambahkan: ${activeMenu.name}${optionLabelText}`);
        }
    };

    // Ubah kuantitas item tertentu di keranjang
    const updateCartQty = (cartId: string, delta: number) => {
        setCart((prevCart) =>
            prevCart
                .map((item) => {
                    if (item.cart_id === cartId) {
                        const newQty = Math.min(50, item.quantity + delta);
                        return newQty > 0 ? { ...item, quantity: newQty } : null;
                    }
                    return item;
                })
                .filter(Boolean) as CartItem[],
        );
    };

    // Hapus item tertentu dari keranjang
    const removeCartItem = (cartId: string) => {
        setCart((prevCart) => prevCart.filter((item) => item.cart_id !== cartId));
    };

    // Hitung total kuantitas per menu_id di keranjang
    const getMenuCartQuantity = (menuId: number): number => {
        return cart
            .filter((item) => item.menu_id === menuId)
            .reduce((sum, item) => sum + item.quantity, 0);
    };

    // Tambah / Kurang kuantitas untuk produk tanpa varian pada kartu menu
    const handleCardQtyChange = (menu: Menu, delta: number) => {
        // Jika produk memiliki varian, tombol + wajib membuka modal pemilihan ukuran
        if (hasMenuVariants(menu)) {
            if (delta > 0) {
                openCustomize(menu);
            } else {
                const matchingItems = cart.filter((item) => item.menu_id === menu.id);
                if (matchingItems.length === 1) {
                    updateCartQty(matchingItems[0].cart_id, -1);
                } else if (matchingItems.length > 1) {
                    setIsCartOpen(true);
                }
            }
            return;
        }

        const now = Date.now();
        const lastClick = quickAddLockRef.current[menu.id] ?? 0;
        if (delta > 0 && now - lastClick < 250) {
            return;
        }
        quickAddLockRef.current[menu.id] = now;

        const matchingItems = cart.filter((item) => item.menu_id === menu.id);
        if (matchingItems.length === 0 && delta > 0) {
            handleQuickAdd(menu);
            return;
        }

        if (matchingItems.length > 0) {
            updateCartQty(matchingItems[0].cart_id, delta);
        }
    };

    const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalCartPrice = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

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

        router.post(
            '/order/checkout',
            {
                qr_token: table.qr_token,
                order_number: activeOrder?.order_number ?? null,
                customer_name: (customerName.trim() || activeOrder?.customer_name || '').trim(),
                notes: orderNotes.trim() || null,
                idempotency_key: idempotencyKeyRef.current,
                items: cart.map((item) => ({
                    menu_id: item.menu_id,
                    quantity: item.quantity,
                    customer_notes: item.customer_notes.trim() || null,
                    selected_option_ids: item.selected_options.map((opt) => opt.option_item_id),
                })),
            },
            {
                onError: (errors) => {
                    checkoutLockRef.current = false;
                    setIsSubmitting(false);
                    idempotencyKeyRef.current = '';
                    toast.error(Object.values(errors)[0] || 'Terjadi kesalahan saat memproses pesanan.');
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
        return categories
            .filter((cat) => selectedCategory === 'all' || cat.id === selectedCategory)
            .map((cat) => ({
                ...cat,
                menus: cat.menus.filter(
                    (m) =>
                        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()))
                ),
            }))
            .filter((cat) => cat.menus.length > 0);
    }, [categories, selectedCategory, searchQuery]);

    const totalAvailableMenus = useMemo(() => {
        return displayedCategories.reduce((sum, cat) => sum + cat.menus.length, 0);
    }, [displayedCategories]);

    // Panggil Pelayan Toast
    const handleCallWaiter = () => {
        toast.success(`🔔 Permintaan Terkirim!`, {
            description: `Pelayan kafe segera menuju ke Meja ${table.table_number}.`,
            duration: 5000,
        });
    };

    return (
        <>
            <Head title={`Pesan Menu - Meja ${table.table_number} • SIDE LINE`} />

            {/* WRAPPER DESKTOP FRAME:
                Di layar Desktop/Laptop: Tampilan terpusat di tengah menyerupai layar HP/Tablet (max-w-md / max-w-lg)
                Di layar HP/Tablet: Tampilan penuh responsif natural
            */}
            <div className="min-h-screen bg-neutral-900 md:py-6 flex justify-center items-start selection:bg-[#FF0000] selection:text-white font-sans">
                <div className="w-full max-w-md sm:max-w-lg min-h-screen md:min-h-[92vh] md:rounded-[36px] bg-[#FBF1CB] shadow-2xl relative overflow-x-hidden flex flex-col md:border-[8px] md:border-neutral-800">
                    
                    {/* 1. TOP BRAND HEADER */}
                    <header className="px-4 pt-4 pb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            {/* Icon Logo Kafe */}
                            <div className="size-10 rounded-2xl bg-[#F5E6B4] border border-[#E9D79F] flex items-center justify-center shadow-2xs">
                                <Coffee className="size-5 text-neutral-800" />
                            </div>

                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-heading font-extrabold text-base tracking-tight text-neutral-900 uppercase">
                                        SIDE LINE
                                    </span>
                                    {/* Pill Merah SIDEORDER */}
                                    <span className="bg-[#FF0000] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full tracking-wider uppercase shadow-2xs">
                                        SIDEORDER
                                    </span>
                                </div>
                                <p className="text-[11px] text-neutral-600 font-medium">Cafe & Roastery</p>
                            </div>
                        </div>

                        {/* Bell Icon Button */}
                        <button
                            type="button"
                            onClick={handleCallWaiter}
                            className="size-9 rounded-xl bg-white/70 border border-[#E8DCB2] flex items-center justify-center text-neutral-800 shadow-2xs hover:bg-white active:scale-95 transition cursor-pointer"
                            title="Panggil Pelayan"
                        >
                            <Bell className="size-4" />
                        </button>
                    </header>

                    {/* 2. CARD INFO MEJA & WIFI (WHITE FLOATING CARD) */}
                    <div className="px-4 pt-2 pb-3">
                        <div className="bg-white rounded-2xl p-3.5 shadow-xs border border-[#E8DCB2] space-y-2.5">
                            {/* Baris Atas Info Meja */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    {/* Pill Hitam Nomor Meja */}
                                    <span className="bg-neutral-950 text-white font-black text-xs px-3 py-1 rounded-full shadow-2xs">
                                        MEJA {table.table_number}
                                    </span>

                                    {/* Token Meja */}
                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/70 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        QR-{table.qr_token.substring(0, 8).toUpperCase()}
                                    </span>
                                </div>

                                {/* Tombol Panggil Pelayan */}
                                <button
                                    type="button"
                                    onClick={handleCallWaiter}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 text-[11px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1 active:scale-95 transition cursor-pointer"
                                >
                                    <Bell className="size-3" /> Panggil Pelayan
                                </button>
                            </div>

                            {/* Baris Bawah Lokasi & WiFi */}
                            <div className="flex items-center justify-between text-xs text-neutral-600 pt-0.5 border-t border-neutral-100">
                                <div className="flex items-center gap-1 text-[11px] font-medium text-neutral-700">
                                    <Store className="size-3.5 text-neutral-500" />
                                    <span>{table.name || 'Area Indoor Lantai 1'}</span>
                                </div>

                                <div className="bg-[#FEF6D8] border border-[#F5E59F] text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                    <Wifi className="size-3 text-amber-700" />
                                    <span>WIFI: SIDELINE-GUEST</span>
                                </div>
                            </div>
                        </div>

                        {/* Banner Pesanan Aktif (Mode Tambah Menu ke Pesanan yang Sedang Berjalan) */}
                        {activeOrder && (
                            <div className="mt-2.5 bg-neutral-950 text-white rounded-2xl p-3.5 shadow-sm border border-neutral-800 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                                        <span className="text-xs font-extrabold tracking-tight">
                                            Tambah Menu ke #{activeOrder.order_number}
                                        </span>
                                    </div>
                                    <Link
                                        href={`/order/status/${activeOrder.order_number}`}
                                        className="text-[11px] font-bold bg-white/15 hover:bg-white/25 text-white px-2.5 py-1 rounded-full transition"
                                    >
                                        Lihat Status
                                    </Link>
                                </div>
                                <p className="text-[11px] text-neutral-300 leading-relaxed">
                                    Pesanan atas nama{' '}
                                    <strong className="text-white">
                                        {activeOrder.customer_name}
                                    </strong>{' '}
                                    sedang{' '}
                                    <strong className="text-amber-300">
                                        {activeOrder.order_status === 'processing'
                                            ? 'diracik barista'
                                            : 'menunggu konfirmasi'}
                                    </strong>{' '}
                                    ({activeOrder.active_items_count} item •{' '}
                                    <span className="font-mono font-bold text-white">
                                        {formatRupiah(activeOrder.total_amount)}
                                    </span>
                                    ). Menu baru akan digabungkan ke pesanan ini.
                                </p>
                            </div>
                        )}

                        {!activeOrder && lockedOrderNotice && (
                            <div className="mt-2.5 bg-amber-50 border border-amber-300 text-amber-950 rounded-2xl p-3 text-xs flex items-start gap-2">
                                <AlertCircle className="size-4 text-amber-700 shrink-0 mt-0.5" />
                                <span>{lockedOrderNotice}</span>
                            </div>
                        )}
                    </div>

                    {/* 3. INPUT PENCARIAN (ROUNDED WHITE PILL) */}
                    <div className="px-4 pb-3">
                        <div className="bg-white border border-[#E8DCB2] rounded-xl px-3 py-2 flex items-center gap-2 shadow-2xs">
                            <Search className="size-4 text-neutral-400 shrink-0" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Cari kopi, pastry, atau cemilan..."
                                className="bg-transparent text-xs text-neutral-800 placeholder:text-neutral-400 outline-none flex-1 font-medium"
                            />
                            <SlidersHorizontal className="size-4 text-neutral-400 shrink-0" />
                        </div>
                    </div>

                    {/* 4. HORIZONTAL CATEGORY PILLS */}
                    <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                            {/* Tombol Semua */}
                            <button
                                type="button"
                                onClick={() => setSelectedCategory('all')}
                                className={`font-heading text-xs font-bold px-4 py-1.5 rounded-full transition-all shrink-0 cursor-pointer shadow-2xs ${
                                    selectedCategory === 'all'
                                        ? 'bg-[#1E1E1E] text-white flex items-center gap-1.5'
                                        : 'bg-white text-neutral-700 border border-[#E8DCB2] hover:bg-white/90'
                                }`}
                            >
                                {selectedCategory === 'all' && (
                                    <span className="size-1.5 rounded-full bg-[#FF0000]" />
                                )}
                                <span>Semua</span>
                            </button>

                            {/* Tombol per Kategori */}
                            {categories.map((cat) => {
                                const isSelected = selectedCategory === cat.id;
                                return (
                                    <button
                                        key={cat.id}
                                        type="button"
                                        onClick={() => setSelectedCategory(cat.id)}
                                        className={`font-heading text-xs font-bold px-4 py-1.5 rounded-full transition-all shrink-0 cursor-pointer shadow-2xs ${
                                            isSelected
                                                ? 'bg-[#1E1E1E] text-white flex items-center gap-1.5'
                                                : 'bg-white text-neutral-700 border border-[#E8DCB2] hover:bg-white/90'
                                        }`}
                                    >
                                        {isSelected && (
                                            <span className="size-1.5 rounded-full bg-[#FF0000]" />
                                        )}
                                        <span>{cat.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* 5. DAFTAR MENU UTAMA */}
                    <main className="px-4 flex-1 pb-32 space-y-5">
                        {/* Judul Bagian */}
                        <div className="flex items-baseline justify-between pt-1">
                            <h2 className="font-heading text-base font-extrabold tracking-tight text-neutral-900">
                                {selectedCategory === 'all'
                                    ? 'Pilihan Populer & Khas'
                                    : categories.find((c) => c.id === selectedCategory)?.name || 'Daftar Menu'}
                            </h2>
                            <span className="text-[11px] text-neutral-600 font-medium">
                                {totalAvailableMenus} Menu Tersedia
                            </span>
                        </div>

                        {displayedCategories.length === 0 ? (
                            <div className="bg-white rounded-2xl p-8 text-center text-neutral-500 border border-[#E8DCB2] space-y-2">
                                <Coffee className="size-10 mx-auto stroke-1 opacity-50 text-neutral-400" />
                                <p className="font-heading text-xs font-bold text-neutral-700">Menu tidak ditemukan</p>
                                <p className="text-[11px]">Coba cari dengan kata kunci lain.</p>
                            </div>
                        ) : (
                            displayedCategories.map((cat) => (
                                <div key={cat.id} className="space-y-3">
                                    {selectedCategory === 'all' && (
                                        <div className="flex items-center gap-2 pt-2">
                                            <span className="size-1.5 rounded-full bg-[#FF0000]" />
                                            <h3 className="font-heading font-extrabold text-xs text-neutral-700 tracking-wider uppercase">
                                                {cat.name}
                                            </h3>
                                        </div>
                                    )}

                                    <div className="space-y-3">
                                        {cat.menus.map((menu) => {
                                            const badgeInfo = getMenuBadge(menu, cat.name);
                                            const menuCartItems = cart.filter((item) => item.menu_id === menu.id);
                                            const cartQty = menuCartItems.reduce((sum, item) => sum + item.quantity, 0);
                                            const menuHasVariants = hasMenuVariants(menu);
                                            const imageSrc = menu.image_path
                                                ? `/storage/${menu.image_path}`
                                                : getMenuFallbackImage(menu.name, cat.name);

                                            return (
                                                <div
                                                    key={menu.id}
                                                    className="bg-white rounded-2xl p-3.5 shadow-xs border border-[#E8DCB2] flex gap-3.5 items-center justify-between transition hover:shadow-md"
                                                >
                                                    {/* Kiri: Teks & Harga & Tombol */}
                                                    <div className="flex-1 pr-1 space-y-1">
                                                        {/* Badges */}
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <span
                                                                className={`text-[9px] font-black px-1.5 py-0.5 rounded font-mono uppercase tracking-wider ${badgeInfo.bg} ${badgeInfo.text}`}
                                                            >
                                                                {badgeInfo.label}
                                                            </span>
                                                            <span className="text-[10px] text-neutral-400 font-medium">
                                                                {badgeInfo.sub}
                                                            </span>
                                                            {menuHasVariants && (
                                                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-600 border border-neutral-200">
                                                                    Pilih Ukuran
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Judul Menu */}
                                                        <h4 className="font-heading font-bold text-sm text-neutral-900 leading-snug tracking-tight">
                                                            {menu.name}
                                                        </h4>

                                                        {/* Deskripsi */}
                                                        {menu.description && (
                                                            <p className="text-[11px] text-neutral-500 line-clamp-2 leading-relaxed">
                                                                {menu.description}
                                                            </p>
                                                        )}

                                                        {/* Ringkasan Varian yang Sudah Ada di Keranjang (Klik untuk Edit Ukuran) */}
                                                        {menuCartItems.length > 0 && menuHasVariants && (
                                                            <div className="flex flex-wrap items-center gap-1 pt-1">
                                                                {menuCartItems.map((ci) => {
                                                                    const optLabel =
                                                                        ci.selected_options.length > 0
                                                                            ? ci.selected_options
                                                                                  .map((o) => o.option_name)
                                                                                  .join(', ')
                                                                            : 'Standar';
                                                                    return (
                                                                        <button
                                                                            key={ci.cart_id}
                                                                            type="button"
                                                                            onClick={() => openEditCartItem(ci)}
                                                                            className="inline-flex items-center gap-1 rounded-md border border-[#E8DCB2] bg-[#FEF6D8] px-2 py-0.5 text-[10px] font-bold text-amber-950 hover:border-[#FF0000] transition cursor-pointer"
                                                                            title="Klik untuk ubah ukuran atau jumlah"
                                                                        >
                                                                            <span>
                                                                                {optLabel} ×{ci.quantity}
                                                                            </span>
                                                                            <Pencil className="size-2.5 text-neutral-500" />
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}

                                                        {/* Harga & Tombol Tambah */}
                                                        <div className="pt-1.5 flex items-center justify-between gap-2">
                                                            <div>
                                                                <span className="font-extrabold text-sm text-neutral-900">
                                                                    {formatRupiah(menu.base_price)}
                                                                </span>
                                                                {menuHasVariants && (
                                                                    <span className="block text-[9px] text-neutral-400 font-medium">
                                                                        Harga mulai dari
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Tombol Aksi:
                                                                - Untuk menu DENGAN varian ukuran: tombol +Tambah selalu membuka modal pemilihan ukuran agar bisa tambah berbagai ukuran (misal Large & XL)
                                                                - Untuk menu TANPA varian: tampilkan stepper [- qty +] jika sudah ada di keranjang
                                                            */}
                                                            {menuHasVariants ? (
                                                                <div className="flex items-center gap-1.5">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => openCustomize(menu)}
                                                                        className="bg-[#FF0000] hover:bg-[#e00000] active:scale-95 text-white text-xs font-extrabold px-3.5 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                                                    >
                                                                        <Plus className="size-3.5 stroke-[3]" />
                                                                        <span>Tambah</span>
                                                                        {cartQty > 0 && (
                                                                            <span className="ml-0.5 bg-white text-[#FF0000] text-[10px] font-black px-1.5 py-0.2 rounded-full">
                                                                                {cartQty}
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                            ) : cartQty > 0 ? (
                                                                <div className="flex items-center border border-neutral-300 rounded-lg px-1.5 py-0.5 bg-white text-neutral-800 text-xs font-bold gap-2 shadow-2xs">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleCardQtyChange(menu, -1)}
                                                                        className="size-5 flex items-center justify-center hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
                                                                    >
                                                                        <Minus className="size-3" />
                                                                    </button>
                                                                    <span className="font-mono text-xs font-black min-w-[14px] text-center">
                                                                        {cartQty}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleCardQtyChange(menu, 1)}
                                                                        className="size-5 flex items-center justify-center hover:bg-neutral-100 rounded text-neutral-600 cursor-pointer"
                                                                    >
                                                                        <Plus className="size-3" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleQuickAdd(menu)}
                                                                    className="bg-[#FF0000] hover:bg-[#e00000] active:scale-95 text-white text-xs font-extrabold px-3.5 py-1.5 rounded-lg flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                                                >
                                                                    <Plus className="size-3.5 stroke-[3]" /> Tambah
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Kanan: Foto Menu Rounded */}
                                                    <div
                                                        className="size-20 sm:size-22 rounded-xl bg-neutral-100 overflow-hidden shrink-0 border border-neutral-100 shadow-2xs cursor-pointer relative"
                                                        onClick={() => openCustomize(menu)}
                                                        title="Klik untuk lihat detail & kustomisasi"
                                                    >
                                                        <img
                                                            src={imageSrc}
                                                            alt={menu.name}
                                                            className="size-full object-cover transition-transform duration-300 hover:scale-105"
                                                            loading="lazy"
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}

                        {/* 6. BANNER ALERGI & CATATAN KHUSUS */}
                        <div className="bg-[#FDF8E2] border border-[#ECDFA8] text-amber-950 text-xs rounded-xl p-3 flex gap-2.5 items-start shadow-2xs mt-4">
                            <div className="size-5 rounded-full bg-rose-500/10 text-[#FF0000] flex items-center justify-center shrink-0 mt-0.5">
                                <AlertCircle className="size-3.5 text-[#FF0000]" />
                            </div>
                            <p className="text-[11px] leading-relaxed">
                                Ada alergi atau catatan khusus? Kamu bisa menambahkan catatan di halaman checkout sebelum
                                pesanan diteruskan ke barista & dapur.
                            </p>
                        </div>
                    </main>

                    {/* 7. FLOATING STICKY BOTTOM CHECKOUT BAR */}
                    {cart.length > 0 && (
                        <div className="sticky bottom-3 left-0 right-0 px-3 z-30">
                            {/* Bar Hitam dengan Tombol Merah #FF0000 */}
                            <div className="bg-neutral-950 text-white p-3 rounded-2xl shadow-2xl flex items-center justify-between border border-neutral-800">
                                <div>
                                    <span className="text-[9px] text-neutral-400 font-bold tracking-wider uppercase block">
                                        PESANAN SEMENTARA
                                    </span>
                                    <div className="font-extrabold text-xs sm:text-sm text-white">
                                        {totalCartItems} item dipesan • {formatRupiah(totalCartPrice)}
                                    </div>
                                </div>

                                {/* TOMBOL LIHAT KERANJANG RED #FF0000 */}
                                <button
                                    type="button"
                                    onClick={() => setIsCartOpen(true)}
                                    className="bg-[#FF0000] hover:bg-[#e00000] active:scale-95 text-white font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-md transition cursor-pointer"
                                >
                                    <span>Lihat Keranjang ({totalCartItems})</span>
                                    <ArrowRight className="size-3.5 stroke-[3]" />
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
                        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-0 gap-0 rounded-3xl bg-white border font-sans">
                            {activeMenu && (
                                <div>
                                    {/* Foto Menu Header Modal */}
                                    <div className="h-44 w-full bg-neutral-100 overflow-hidden relative">
                                        <img
                                            src={
                                                activeMenu.image_path
                                                    ? `/storage/${activeMenu.image_path}`
                                                    : getMenuFallbackImage(activeMenu.name, '')
                                            }
                                            alt={activeMenu.name}
                                            className="size-full object-cover"
                                        />
                                        {editingCartId !== null && (
                                            <div className="absolute top-3 left-3">
                                                <span className="rounded-full bg-neutral-900/90 text-white text-[10px] font-extrabold px-3 py-1 shadow-xs uppercase tracking-wider">
                                                    Ubah Item Keranjang
                                                </span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="p-5 space-y-4">
                                        <DialogHeader className="text-left space-y-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <DialogTitle className="font-heading text-lg font-extrabold text-neutral-900 tracking-tight">
                                                    {activeMenu.name}
                                                </DialogTitle>
                                                <span className="font-sans tabular-nums text-base font-extrabold text-neutral-900">
                                                    {formatRupiah(calculateCustomUnitPrice())}
                                                </span>
                                            </div>
                                            {activeMenu.description && (
                                                <DialogDescription className="text-xs text-neutral-500 pt-0.5">
                                                    {activeMenu.description}
                                                </DialogDescription>
                                            )}
                                        </DialogHeader>

                                        {/* Grup Opsi Kustomisasi (Ukuran, Topping, dll) */}
                                        {activeMenu.option_groups && activeMenu.option_groups.length > 0 && (
                                            <div className="space-y-4 divide-y divide-neutral-100 pt-1">
                                                {activeMenu.option_groups.map((group) => {
                                                    const isSingle = isSingleSelectGroup(group);
                                                    const baseMenuPrice = parseFloat(activeMenu.base_price) || 0;

                                                    return (
                                                        <div key={group.id} className="pt-3 space-y-2">
                                                            <div className="flex items-center justify-between text-xs">
                                                                <span className="font-extrabold uppercase tracking-wider text-neutral-800">
                                                                    Pilih {group.name}
                                                                </span>
                                                                <span className="text-[11px] font-semibold text-neutral-500">
                                                                    {isSingle ? 'Pilih 1' : 'Bisa Banyak'}
                                                                    {group.is_required && ' • Wajib'}
                                                                </span>
                                                            </div>

                                                            <div className="space-y-1.5">
                                                                {group.option_items
                                                                    .filter((item) => item.is_active)
                                                                    .map((item) => {
                                                                        const isChecked = selectedOptionIds.includes(
                                                                            item.id,
                                                                        );
                                                                        const addPrice =
                                                                            parseFloat(item.additional_price) || 0;
                                                                        const fullSizePrice = baseMenuPrice + addPrice;

                                                                        return (
                                                                            <div
                                                                                key={item.id}
                                                                                onClick={() =>
                                                                                    handleToggleOption(group, item)
                                                                                }
                                                                                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                                                                                    isChecked
                                                                                        ? 'bg-rose-50 border-[#FF0000] text-[#FF0000] font-bold shadow-2xs'
                                                                                        : 'bg-card hover:bg-neutral-50 border-neutral-200 text-neutral-800'
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center gap-2.5">
                                                                                    <Checkbox
                                                                                        checked={isChecked}
                                                                                        className="rounded-full pointer-events-none"
                                                                                    />
                                                                                    <span className="text-xs font-bold">
                                                                                        {item.name}
                                                                                    </span>
                                                                                </div>
                                                                                <div className="text-right font-mono">
                                                                                    {isSingle ? (
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <span className="font-black text-neutral-900">
                                                                                                {formatRupiah(
                                                                                                    fullSizePrice,
                                                                                                )}
                                                                                            </span>
                                                                                            {addPrice > 0 && (
                                                                                                <span className="text-[10px] text-neutral-500 font-normal">
                                                                                                    (+
                                                                                                    {formatRupiah(
                                                                                                        addPrice,
                                                                                                    )}
                                                                                                    )
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-neutral-600">
                                                                                            {addPrice > 0
                                                                                                ? `+${formatRupiah(addPrice)}`
                                                                                                : 'Gratis'}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}

                                        {/* Catatan Khusus */}
                                        <div className="space-y-1.5 pt-1">
                                            <Label htmlFor="cust_notes" className="text-xs font-bold text-neutral-700">
                                                Catatan Khusus (Opsional)
                                            </Label>
                                            <Input
                                                id="cust_notes"
                                                value={customizeNotes}
                                                onChange={(e) => setCustomizeNotes(e.target.value)}
                                                placeholder="Misal: Less ice, jangan terlalu manis..."
                                                className="text-xs h-9 bg-neutral-50"
                                            />
                                        </div>

                                        {/* Kuantitas & Tombol Tambahkan ke Keranjang / Simpan Perubahan */}
                                        <div className="pt-3 flex items-center justify-between gap-2.5 border-t">
                                            {editingCartId !== null && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        removeCartItem(editingCartId);
                                                        setEditingCartId(null);
                                                        setIsCustomizeOpen(false);
                                                        toast.success('Item dihapus dari keranjang.');
                                                    }}
                                                    className="h-11 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs flex items-center justify-center cursor-pointer transition"
                                                    title="Hapus item dari keranjang"
                                                >
                                                    <Trash2 className="size-4" />
                                                </button>
                                            )}

                                            <div className="flex items-center border border-neutral-300 rounded-xl p-1 bg-neutral-50">
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomizeQty(Math.max(1, customizeQty - 1))}
                                                    className="size-7 rounded-lg flex items-center justify-center hover:bg-neutral-200 text-neutral-700 cursor-pointer"
                                                >
                                                    <Minus className="size-3.5" />
                                                </button>
                                                <span className="w-8 text-center font-mono font-black text-sm text-neutral-900">
                                                    {customizeQty}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomizeQty(Math.min(50, customizeQty + 1))}
                                                    className="size-7 rounded-lg flex items-center justify-center hover:bg-neutral-200 text-neutral-700 cursor-pointer"
                                                >
                                                    <Plus className="size-3.5" />
                                                </button>
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleSaveFromModal}
                                                className="flex-1 rounded-xl h-11 bg-[#FF0000] hover:bg-[#e00000] text-white font-extrabold text-xs sm:text-sm shadow-md active:scale-95 transition cursor-pointer px-3"
                                            >
                                                {editingCartId !== null
                                                    ? `Simpan Perubahan — ${formatRupiah(calculateCustomUnitPrice() * customizeQty)}`
                                                    : `Tambahkan ke Keranjang — ${formatRupiah(calculateCustomUnitPrice() * customizeQty)}`}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </DialogContent>
                    </Dialog>

                    {/* ========================================================================= */}
                    {/* MODAL 2: KERANJANG BELANJA & CHECKOUT PESANAN                             */}
                    {/* ========================================================================= */}
                    <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
                        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white border font-sans">
                            <form onSubmit={handleCheckout} className="space-y-4">
                                <DialogHeader className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <DialogTitle className="font-heading text-lg font-extrabold text-neutral-900 tracking-tight">
                                            Rincian Pesanan
                                        </DialogTitle>
                                        <Badge className="bg-neutral-900 text-white font-black text-xs px-2.5 py-0.5">
                                            MEJA {table.table_number}
                                        </Badge>
                                    </div>
                                    <DialogDescription className="text-xs text-neutral-500">
                                        Periksa kembali ukuran, kuantitas, dan catatan sebelum dikirim ke barista & kasir.
                                    </DialogDescription>
                                </DialogHeader>

                                {/* Daftar Item di Keranjang */}
                                <div className="space-y-3 divide-y divide-neutral-100 max-h-64 overflow-y-auto pr-1">
                                    {cart.map((item) => {
                                        const variantNames = item.selected_options
                                            .map((o) => o.option_name)
                                            .join(', ');

                                        return (
                                            <div key={item.cart_id} className="pt-3 first:pt-0 space-y-1.5">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <h4 className="font-heading font-bold text-sm text-neutral-900 leading-snug tracking-tight">
                                                            {item.menu_name}
                                                            {variantNames ? ` — ${variantNames}` : ''}
                                                        </h4>
                                                        <span className="font-mono text-xs text-neutral-500">
                                                            {item.quantity} × {formatRupiah(item.unit_price)}
                                                        </span>
                                                    </div>
                                                    <span className="font-mono font-bold text-sm text-neutral-900 shrink-0">
                                                        {formatRupiah(item.unit_price * item.quantity)}
                                                    </span>
                                                </div>

                                                {item.selected_options.length > 0 && (
                                                    <div className="flex flex-wrap gap-1">
                                                        {item.selected_options.map((o) => (
                                                            <span
                                                                key={o.option_item_id}
                                                                className="inline-flex items-center rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700"
                                                            >
                                                                {o.group_name}: {o.option_name}
                                                                {o.additional_price > 0
                                                                    ? ` (+${formatRupiah(o.additional_price)})`
                                                                    : ''}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                {item.customer_notes && (
                                                    <p className="text-[11px] text-amber-700 italic">
                                                        Catatan: &ldquo;{item.customer_notes}&rdquo;
                                                    </p>
                                                )}

                                                <div className="flex items-center justify-between pt-1">
                                                    <div className="flex items-center gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={() => openEditCartItem(item)}
                                                            className="text-[11px] font-bold text-neutral-700 hover:text-[#FF0000] flex items-center gap-1 cursor-pointer transition"
                                                        >
                                                            <Pencil className="size-3" />
                                                            <span>
                                                                {item.selected_options.length > 0
                                                                    ? 'Ubah Ukuran'
                                                                    : 'Ubah Catatan'}
                                                            </span>
                                                        </button>

                                                        <button
                                                            type="button"
                                                            onClick={() => removeCartItem(item.cart_id)}
                                                            className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-0.5 cursor-pointer"
                                                        >
                                                            <Trash2 className="size-3" /> Hapus
                                                        </button>
                                                    </div>

                                                    <div className="flex items-center border border-neutral-300 rounded-lg bg-neutral-50 px-1 py-0.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => updateCartQty(item.cart_id, -1)}
                                                            className="size-5 flex items-center justify-center text-neutral-600 hover:bg-neutral-200 rounded cursor-pointer"
                                                        >
                                                            <Minus className="size-3" />
                                                        </button>
                                                        <span className="w-6 text-center font-mono text-xs font-black">
                                                            {item.quantity}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => updateCartQty(item.cart_id, 1)}
                                                            className="size-5 flex items-center justify-center text-neutral-600 hover:bg-neutral-200 rounded cursor-pointer"
                                                        >
                                                            <Plus className="size-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Form Identitas Pemesan */}
                                <div className="space-y-3 pt-2 border-t">
                                    <div className="space-y-1">
                                        <Label htmlFor="cust_name" className="text-xs font-bold text-neutral-800">
                                            Nama Pemesan <span className="text-[#FF0000]">*</span>
                                        </Label>
                                        <Input
                                            id="cust_name"
                                            value={customerName}
                                            onChange={(e) => setCustomerName(e.target.value)}
                                            placeholder="Contoh: Budi, Titan, dsb."
                                            required
                                            className="h-10 text-sm bg-neutral-50"
                                            autoFocus
                                        />
                                        <p className="text-[10px] text-neutral-500">
                                            Nama ini akan dipanggil oleh kasir saat pesanan siap diambil/diantar.
                                        </p>
                                    </div>

                                    <div className="space-y-1">
                                        <Label htmlFor="order_notes" className="text-xs font-bold text-neutral-800">
                                            Catatan Tambahan Meja (Opsional)
                                        </Label>
                                        <Input
                                            id="order_notes"
                                            value={orderNotes}
                                            onChange={(e) => setOrderNotes(e.target.value)}
                                            placeholder="Misal: Sendok garpu dipisah, sedotan kertas..."
                                            className="h-9 text-xs bg-neutral-50"
                                        />
                                    </div>
                                </div>

                                {/* Ringkasan Total & Tombol Kirim Pesanan Merah #FF0000 */}
                                <div className="border-t pt-3 space-y-3">
                                    {activeOrder ? (
                                        <div className="rounded-2xl bg-neutral-50 border border-neutral-200 p-3 space-y-1.5 text-xs">
                                            <div className="flex items-center justify-between text-neutral-600">
                                                <span>
                                                    Tagihan Saat Ini (#{activeOrder.order_number}):
                                                </span>
                                                <span className="font-mono font-semibold">
                                                    {formatRupiah(activeOrder.total_amount)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-neutral-700 font-semibold">
                                                <span>Menu Tambahan Baru ({totalCartItems} item):</span>
                                                <span className="font-mono text-[#FF0000]">
                                                    +{formatRupiah(totalCartPrice)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between pt-1.5 border-t border-neutral-200 font-black text-sm text-neutral-900">
                                                <span>Total Tagihan Gabungan:</span>
                                                <span className="font-mono text-base">
                                                    {formatRupiah(
                                                        activeOrder.total_amount + totalCartPrice,
                                                    )}
                                                </span>
                                            </div>
                                            {activeOrder.settled_amount > 0 && (
                                                <div className="pt-1 border-t border-dashed border-neutral-200 space-y-1 text-[11px]">
                                                    <div className="flex items-center justify-between text-emerald-700 font-semibold">
                                                        <span>Sudah Dibayar Sebelumnya:</span>
                                                        <span className="font-mono">
                                                            {formatRupiah(activeOrder.settled_amount)}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center justify-between text-rose-700 font-bold">
                                                        <span>Sisa Tagihan Tambahan:</span>
                                                        <span className="font-mono">
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
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-neutral-600 font-medium">
                                                Total Pembayaran:
                                            </span>
                                            <span className="font-mono text-lg font-black text-neutral-900">
                                                {formatRupiah(totalCartPrice)}
                                            </span>
                                        </div>
                                    )}

                                    <div className="p-2.5 rounded-xl bg-[#FEF6D8] border border-[#F5E59F] text-[11px] text-amber-950">
                                        <p className="font-bold">
                                            {activeOrder
                                                ? `Digabungkan ke Pesanan Aktif #${activeOrder.order_number}`
                                                : 'Metode Pembayaran: Kasir (Tunai / QRIS)'}
                                        </p>
                                        <p className="text-[10px] text-amber-900 mt-0.5">
                                            {activeOrder
                                                ? activeOrder.settled_amount > 0
                                                    ? 'Pembayaran sebelumnya tetap tercatat aman. Anda hanya perlu membayar selisih menu tambahan di kasir.'
                                                    : 'Menu baru akan digabungkan ke tagihan pesanan Anda yang sedang berjalan.'
                                                : 'Setelah klik kirim pesanan, silakan ke kasir untuk konfirmasi dan pembayaran.'}
                                        </p>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting || cart.length === 0}
                                        className="w-full h-12 bg-[#FF0000] hover:bg-[#e00000] active:scale-95 text-white font-extrabold text-sm rounded-xl shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                                    >
                                        {isSubmitting ? (
                                            'Mengirim Pesanan...'
                                        ) : (
                                            <>
                                                <span>
                                                    {activeOrder
                                                        ? `Tambahkan ke Pesanan #${activeOrder.order_number}`
                                                        : 'Kirim Pesanan Sekarang'}
                                                </span>
                                                <ArrowRight className="size-4 stroke-[3]" />
                                            </>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>
        </>
    );
}