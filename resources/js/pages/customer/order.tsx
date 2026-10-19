import { Head, router } from '@inertiajs/react';
import { Coffee, Image as ImageIcon, Minus, Plus, Search, ShoppingBag, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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
}

export default function CustomerOrder({ table, categories }: Props) {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');

    // State Modal Kustomisasi
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const [activeMenu, setActiveMenu] = useState<Menu | null>(null);
    const [customizeQty, setCustomizeQty] = useState(1);
    const [customizeNotes, setCustomizeNotes] = useState('');
    const [selectedOptionIds, setSelectedOptionIds] = useState<number[]>([]);

    // State Keranjang Belanja
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [orderNotes, setOrderNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Muat keranjang tersimpan dari localStorage saat halaman pertama kali dibuka
    useEffect(() => {
        const savedCart = localStorage.getItem(`sideorder_cart_${table.qr_token}`);
        if (savedCart) {
            try {
                setCart(JSON.parse(savedCart));
            } catch (e) {
                console.error(e);
            }
        }
    }, [table.qr_token]);

    // Simpan otomatis ke localStorage setiap keranjang berubah
    useEffect(() => {
        localStorage.setItem(`sideorder_cart_${table.qr_token}`, JSON.stringify(cart));
    }, [cart, table.qr_token]);

    const formatRupiah = (amount: number | string) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
    };

    // Buka Modal Kustomisasi Menu
    const openCustomize = (menu: Menu) => {
        setActiveMenu(menu);
        setCustomizeQty(1);
        setCustomizeNotes('');

        // Pre-select default options jika ada
        const defaults: number[] = [];
        if (menu.option_groups) {
            menu.option_groups.forEach((group) => {
                const defaultItem = group.option_items.find((i) => i.is_default && i.is_active);
                if (defaultItem) {
                    defaults.push(defaultItem.id);
                } else if (group.is_required && group.selection_type === 'single' && group.option_items.length > 0) {
                    defaults.push(group.option_items[0].id);
                }
            });
        }
        setSelectedOptionIds(defaults);
        setIsCustomizeOpen(true);
    };

    // Handler Toggle Opsi
    const handleToggleOption = (group: OptionGroup, item: OptionItem) => {
        if (group.selection_type === 'single') {
            // Radio: hilangkan pilihan lain di grup yang sama
            const otherIds = group.option_items.map((i) => i.id);
            const filtered = selectedOptionIds.filter((id) => !otherIds.includes(id));
            setSelectedOptionIds([...filtered, item.id]);
        } else {
            // Checkbox: toggle tambah/hapus
            if (selectedOptionIds.includes(item.id)) {
                setSelectedOptionIds(selectedOptionIds.filter((id) => id !== item.id));
            } else {
                setSelectedOptionIds([...selectedOptionIds, item.id]);
            }
        }
    };

    // Hitung harga satuan item yang sedang dikustomisasi
    const calculateCustomUnitPrice = (): number => {
        if (!activeMenu) return 0;
        let price = parseFloat(activeMenu.base_price);

        if (activeMenu.option_groups) {
            activeMenu.option_groups.forEach((group) => {
                group.option_items.forEach((item) => {
                    if (selectedOptionIds.includes(item.id)) {
                        price += parseFloat(item.additional_price);
                    }
                });
            });
        }
        return price;
    };

    // Tambah item ke Keranjang Belanja
    const handleAddToCart = () => {
        if (!activeMenu) return;

        const optionsToStore: CartOption[] = [];
        if (activeMenu.option_groups) {
            activeMenu.option_groups.forEach((group) => {
                group.option_items.forEach((item) => {
                    if (selectedOptionIds.includes(item.id)) {
                        optionsToStore.push({
                            group_name: group.name,
                            option_name: item.name,
                            additional_price: parseFloat(item.additional_price),
                            option_item_id: item.id,
                        });
                    }
                });
            });
        }

        const unitPrice = calculateCustomUnitPrice();
        const cartId = `${activeMenu.id}-${selectedOptionIds.sort().join('_')}-${customizeNotes.trim()}`;

        // Cek apakah item yang persis sama sudah ada di keranjang
        const existingIdx = cart.findIndex((c) => c.cart_id === cartId);
        if (existingIdx > -1) {
            const updated = [...cart];
            updated[existingIdx].quantity += customizeQty;
            setCart(updated);
        } else {
            setCart([
                ...cart,
                {
                    cart_id: cartId,
                    menu_id: activeMenu.id,
                    menu_name: activeMenu.name,
                    base_price: parseFloat(activeMenu.base_price),
                    unit_price: unitPrice,
                    quantity: customizeQty,
                    customer_notes: customizeNotes,
                    selected_options: optionsToStore,
                },
            ]);
        }

        setIsCustomizeOpen(false);
        toast.success(`Ditambahkan: ${activeMenu.name}`);
    };

    // Ubah kuantitas di keranjang
    const updateCartQty = (cartId: string, delta: number) => {
        const updated = cart
            .map((item) => {
                if (item.cart_id === cartId) {
                    const newQty = item.quantity + delta;
                    return newQty > 0 ? { ...item, quantity: newQty } : null;
                }
                return item;
            })
            .filter(Boolean) as CartItem[];

        setCart(updated);
    };

    const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    const totalCartPrice = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);

    // Kirim Checkout ke Backend
    const handleCheckout = (e: React.FormEvent) => {
        e.preventDefault();

        if (cart.length === 0) {
            toast.error('Keranjang belanja Anda masih kosong.');
            return;
        }

        if (!customerName.trim()) {
            toast.error('Nama pemesan wajib diisi.');
            return;
        }

        setIsSubmitting(true);

        router.post(
            '/order/checkout',
            {
                qr_token: table.qr_token,
                customer_name: customerName.trim(),
                notes: orderNotes.trim() || null,
                items: cart.map((item) => ({
                    menu_id: item.menu_id,
                    quantity: item.quantity,
                    customer_notes: item.customer_notes || null,
                    selected_option_ids: item.selected_options.map((opt) => opt.option_item_id),
                })),
            },
            {
                onError: (errors) => {
                    setIsSubmitting(false);
                    toast.error(Object.values(errors)[0] || 'Terjadi kesalahan saat memproses pesanan.');
                },
                onSuccess: () => {
                    // Bersihkan keranjang lokal setelah order berhasil dibuat
                    localStorage.removeItem(`sideorder_cart_${table.qr_token}`);
                },
            }
        );
    };

    // Filter menu berdasarkan tab dan pencarian
    const allMenus = categories.flatMap((c) => c.menus);
    const displayedCategories = categories
        .filter((cat) => selectedCategory === 'all' || cat.id === selectedCategory)
        .map((cat) => ({
            ...cat,
            menus: cat.menus.filter((m) =>
                m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (m.description && m.description.toLowerCase().includes(searchQuery.toLowerCase()))
            ),
        }))
        .filter((cat) => cat.menus.length > 0);

    return (
        <>
            <Head title={`Pesan Menu - Meja ${table.table_number} - Café SIDE LINE`} />

            <div className="min-h-screen bg-muted/20 pb-28">
                {/* Header Navbar Customer */}
                <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 shadow-xs">
                    <div className="max-w-xl mx-auto flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-1.5">
                                <Coffee className="size-4 text-primary" />
                                <span className="font-extrabold text-sm tracking-wider uppercase">Café SIDE LINE</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Order & Pay from Table</p>
                        </div>

                        <Badge variant="outline" className="px-2.5 py-1 font-mono text-xs font-bold border-primary/30 bg-primary/5">
                            Meja {table.table_number}
                        </Badge>
                    </div>

                    {/* Input Pencarian */}
                    <div className="max-w-xl mx-auto mt-2.5 relative">
                        <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Cari kopi, minuman, atau makanan..."
                            className="pl-9 h-9 text-xs rounded-full bg-muted/40"
                        />
                    </div>
                </header>

                {/* Kategori Tabs (Pills Horizontal Scroll) */}
                <div className="bg-background border-b px-4 py-2 sticky top-[101px] z-20">
                    <div className="max-w-xl mx-auto flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
                        <Button
                            variant={selectedCategory === 'all' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedCategory('all')}
                            className="rounded-full text-xs h-7.5 px-3 shrink-0"
                        >
                            Semua ({allMenus.length})
                        </Button>
                        {categories.map((cat) => (
                            <Button
                                key={cat.id}
                                variant={selectedCategory === cat.id ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setSelectedCategory(cat.id)}
                                className="rounded-full text-xs h-7.5 px-3 shrink-0"
                            >
                                {cat.name} ({cat.menus.length})
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Daftar Menu per Kategori */}
                <main className="max-w-xl mx-auto p-4 space-y-6">
                    {displayedCategories.length === 0 ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <Coffee className="size-10 mx-auto stroke-1 opacity-40 mb-2" />
                            <p className="text-sm font-medium">Menu yang Anda cari tidak ditemukan.</p>
                        </div>
                    ) : (
                        displayedCategories.map((category) => (
                            <section key={category.id} className="space-y-3">
                                <h2 className="font-bold text-base tracking-tight text-foreground flex items-center gap-2">
                                    <span className="size-2 rounded-full bg-primary" />
                                    {category.name}
                                </h2>

                                <div className="grid grid-cols-1 gap-3">
                                    {category.menus.map((menu) => (
                                        <Card
                                            key={menu.id}
                                            className="overflow-hidden border shadow-2xs hover:shadow-sm transition cursor-pointer"
                                            onClick={() => openCustomize(menu)}
                                        >
                                            <CardContent className="p-3.5 flex gap-3.5 items-center justify-between">
                                                <div className="space-y-1 flex-1 pr-2">
                                                    <h3 className="font-semibold text-sm leading-snug">{menu.name}</h3>
                                                    {menu.description && (
                                                        <p className="text-xs text-muted-foreground line-clamp-2">
                                                            {menu.description}
                                                        </p>
                                                    )}
                                                    <div className="pt-1 flex items-center gap-2">
                                                        <span className="font-mono text-sm font-bold text-emerald-600">
                                                            {formatRupiah(menu.base_price)}
                                                        </span>
                                                        {menu.option_groups && menu.option_groups.length > 0 && (
                                                            <span className="text-[10px] text-muted-foreground font-normal">
                                                                (bisa kustomisasi)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Foto Menu & Tombol Tambah */}
                                                <div className="relative shrink-0">
                                                    <div className="size-20 rounded-xl bg-muted overflow-hidden border">
                                                        {menu.image_path ? (
                                                            <img
                                                                src={`/storage/${menu.image_path}`}
                                                                alt={menu.name}
                                                                className="size-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="size-full flex items-center justify-center text-muted-foreground/30">
                                                                <ImageIcon className="size-6" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        className="absolute -bottom-2 -right-1 h-7 text-xs rounded-full shadow-md gap-0.5 px-2.5"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openCustomize(menu);
                                                        }}
                                                    >
                                                        <Plus className="size-3.5" /> Tambah
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </section>
                        ))
                    )}
                </main>

                {/* Floating Bottom Bar: Keranjang Belanja */}
                {cart.length > 0 && (
                    <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-background via-background to-transparent z-40">
                        <div className="max-w-xl mx-auto">
                            <Button
                                onClick={() => setIsCartOpen(true)}
                                size="lg"
                                className="w-full h-13 shadow-xl rounded-2xl flex items-center justify-between px-5 text-sm font-semibold"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="size-7 rounded-full bg-primary-foreground/20 flex items-center justify-center text-xs">
                                        <ShoppingBag className="size-4" />
                                    </div>
                                    <span>{totalCartItems} Menu Dipilih</span>
                                </div>
                                <span className="font-mono text-base font-bold">{formatRupiah(totalCartPrice)}</span>
                            </Button>
                        </div>
                    </div>
                )}

                {/* MODAL 1: Kustomisasi Ukuran & Topping Produk */}
                <Dialog open={isCustomizeOpen} onOpenChange={setIsCustomizeOpen}>
                    <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto p-0 gap-0">
                        {activeMenu && (
                            <div>
                                {/* Foto Header Modal */}
                                {activeMenu.image_path && (
                                    <div className="h-44 w-full bg-muted overflow-hidden">
                                        <img
                                            src={`/storage/${activeMenu.image_path}`}
                                            alt={activeMenu.name}
                                            className="size-full object-cover"
                                        />
                                    </div>
                                )}

                                <div className="p-5 space-y-5">
                                    <DialogHeader className="text-left">
                                        <div className="flex items-start justify-between gap-2">
                                            <DialogTitle className="text-lg font-bold">{activeMenu.name}</DialogTitle>
                                            <span className="font-mono text-base font-bold text-emerald-600">
                                                {formatRupiah(activeMenu.base_price)}
                                            </span>
                                        </div>
                                        {activeMenu.description && (
                                            <DialogDescription className="text-xs text-muted-foreground pt-1">
                                                {activeMenu.description}
                                            </DialogDescription>
                                        )}
                                    </DialogHeader>

                                    {/* Grup Opsi Kustomisasi */}
                                    {activeMenu.option_groups && activeMenu.option_groups.length > 0 && (
                                        <div className="space-y-4 divide-y divide-border pt-1">
                                            {activeMenu.option_groups.map((group) => (
                                                <div key={group.id} className="pt-3 space-y-2">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="font-bold uppercase tracking-wider text-foreground">
                                                            {group.name}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {group.selection_type === 'single' ? 'Pilih 1' : 'Bisa Banyak'}
                                                            {group.is_required && ' • Wajib'}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        {group.option_items.map((item) => {
                                                            const isChecked = selectedOptionIds.includes(item.id);
                                                            const addPrice = parseFloat(item.additional_price);

                                                            return (
                                                                <div
                                                                    key={item.id}
                                                                    onClick={() => handleToggleOption(group, item)}
                                                                    className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${isChecked ? 'bg-primary/5 border-primary text-primary font-medium' : 'bg-card hover:bg-muted/30'}`}
                                                                >
                                                                    <div className="flex items-center gap-2">
                                                                        <Checkbox
                                                                            checked={isChecked}
                                                                            className="rounded-full"
                                                                        />
                                                                        <span>{item.name}</span>
                                                                    </div>
                                                                    <span className="font-mono text-muted-foreground">
                                                                        {addPrice > 0 ? `+${formatRupiah(addPrice)}` : 'Gratis'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Catatan Khusus */}
                                    <div className="space-y-1.5 pt-2">
                                        <Label htmlFor="cust_notes" className="text-xs font-semibold">
                                            Catatan Khusus (Opsional)
                                        </Label>
                                        <Input
                                            id="cust_notes"
                                            value={customizeNotes}
                                            onChange={(e) => setCustomizeNotes(e.target.value)}
                                            placeholder="Misal: Less ice, pisahkan saus..."
                                            className="text-xs h-9"
                                        />
                                    </div>

                                    {/* Kuantitas & Tombol Tambah */}
                                    <div className="pt-2 flex items-center justify-between gap-4 border-t">
                                        <div className="flex items-center border rounded-full p-1 bg-muted/40">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setCustomizeQty(Math.max(1, customizeQty - 1))}
                                                className="size-7 rounded-full p-0"
                                            >
                                                <Minus className="size-3.5" />
                                            </Button>
                                            <span className="w-8 text-center font-mono font-bold text-sm">
                                                {customizeQty}
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setCustomizeQty(customizeQty + 1)}
                                                className="size-7 rounded-full p-0"
                                            >
                                                <Plus className="size-3.5" />
                                            </Button>
                                        </div>

                                        <Button onClick={handleAddToCart} className="flex-1 rounded-xl h-11 font-semibold">
                                            Tambah — {formatRupiah(calculateCustomUnitPrice() * customizeQty)}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </DialogContent>
                </Dialog>

                {/* MODAL 2: Keranjang Belanja & Form Checkout */}
                <Dialog open={isCartOpen} onOpenChange={setIsCartOpen}>
                    <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                        <form onSubmit={handleCheckout} className="space-y-5">
                            <DialogHeader>
                                <DialogTitle className="flex items-center justify-between">
                                    <span>Pesanan Anda</span>
                                    <Badge variant="outline" className="font-mono text-xs">
                                        Meja {table.table_number}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription>
                                    Periksa kembali rincian makanan dan minuman sebelum dikirim.
                                </DialogDescription>
                            </DialogHeader>

                            {/* Daftar Item di Keranjang */}
                            <div className="space-y-3 divide-y divide-border max-h-60 overflow-y-auto pr-1">
                                {cart.map((item) => (
                                    <div key={item.cart_id} className="pt-3 first:pt-0 space-y-1">
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <h4 className="font-bold text-sm">{item.menu_name}</h4>
                                                <span className="font-mono text-xs text-emerald-600 font-semibold">
                                                    {formatRupiah(item.unit_price)} x {item.quantity}
                                                </span>
                                            </div>
                                            <span className="font-mono font-bold text-sm">
                                                {formatRupiah(item.unit_price * item.quantity)}
                                            </span>
                                        </div>

                                        {/* Opsi Terpilih */}
                                        {item.selected_options.length > 0 && (
                                            <p className="text-[11px] text-muted-foreground">
                                                {item.selected_options.map((o) => `${o.group_name}: ${o.option_name}`).join(', ')}
                                            </p>
                                        )}

                                        {/* Catatan bebas */}
                                        {item.customer_notes && (
                                            <p className="text-[11px] text-amber-600 italic">
                                                "{item.customer_notes}"
                                            </p>
                                        )}

                                        {/* Tombol Pengatur Qty */}
                                        <div className="flex items-center justify-between pt-1">
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => updateCartQty(item.cart_id, -item.quantity)}
                                                className="h-6 text-[11px] text-destructive hover:bg-destructive/10 p-0"
                                            >
                                                <Trash2 className="size-3 mr-1" /> Hapus
                                            </Button>

                                            <div className="flex items-center border rounded-full bg-muted/40 p-0.5">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => updateCartQty(item.cart_id, -1)}
                                                    className="size-6 rounded-full p-0"
                                                >
                                                    <Minus className="size-3" />
                                                </Button>
                                                <span className="w-6 text-center font-mono text-xs font-semibold">
                                                    {item.quantity}
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => updateCartQty(item.cart_id, 1)}
                                                    className="size-6 rounded-full p-0"
                                                >
                                                    <Plus className="size-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Input Identitas Pemesan */}
                            <div className="space-y-3 pt-2 border-t">
                                <div className="space-y-1.5">
                                    <Label htmlFor="cust_name" className="text-xs font-bold">
                                        Nama Anda (Wajib) <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="cust_name"
                                        value={customerName}
                                        onChange={(e) => setCustomerName(e.target.value)}
                                        placeholder="Contoh: Budi, Titan, dsb."
                                        required
                                        className="h-10 text-sm"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Nama ini akan dipanggil oleh kasir / barista saat pesanan siap.
                                    </p>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="order_notes" className="text-xs font-bold">
                                        Catatan Tambahan untuk Kasir (Opsional)
                                    </Label>
                                    <Input
                                        id="order_notes"
                                        value={orderNotes}
                                        onChange={(e) => setOrderNotes(e.target.value)}
                                        placeholder="Misal: Jangan pakai kantong plastik..."
                                        className="h-9 text-xs"
                                    />
                                </div>
                            </div>

                            {/* Ringkasan Total & Tombol Kirim */}
                            <div className="border-t pt-3 space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-muted-foreground">Total Tagihan:</span>
                                    <span className="font-mono text-lg font-bold text-emerald-600">
                                        {formatRupiah(totalCartPrice)}
                                    </span>
                                </div>

                                <div className="p-2.5 rounded-lg bg-muted text-[11px] text-muted-foreground space-y-0.5">
                                    <p className="font-medium text-foreground">Metode Pembayaran: Tunai di Kasir</p>
                                    <p>Setelah pesanan dikirim, silakan lakukan pembayaran di kasir dengan menyebutkan nama Anda.</p>
                                </div>

                                <Button
                                    type="submit"
                                    disabled={isSubmitting || cart.length === 0}
                                    className="w-full h-12 text-sm font-bold rounded-xl"
                                >
                                    {isSubmitting ? 'Mengirim Pesanan...' : 'Kirim Pesanan Sekarang'}
                                </Button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>
        </>
    );
}