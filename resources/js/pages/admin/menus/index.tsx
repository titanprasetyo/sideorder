import { Head, router } from '@inertiajs/react';
import {
    Check,
    CheckCircle2,
    Coffee,
    CupSoda,
    Flame,
    ImagePlus,
    Image as ImageIcon,
    Layers,
    ListChecks,
    Package,
    Pencil,
    Percent,
    Plus,
    Sparkles,
    Tag,
    Trash2,
    Upload,
    X,
    XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    AdminPage,
    ConfirmDialog,
    EmptyState,
    FilterTabs,
    FormDialogHeader,
    IconAction,
    PageHeader,
    Panel,
    SearchInput,
    StandeeModalCard,
    StatCard,
    StatGrid,
    StatusPill,
    ToggleField,
} from '@/components/admin/admin-ui';
import {
    CupHeaderPhosphorIcon,
    resolveSizeIconKey,
    SIZE_ICON_OPTIONS,
    SizeOptionIcon,
    type SizeIconKey,
} from '@/components/menu/size-icon';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface OptionItem {
    id?: number;
    name: string;
    icon: SizeIconKey;
    additional_price: number;
    is_default: boolean;
    is_active: boolean;
}

interface OptionGroup {
    id?: number;
    name: string;
    selection_type: 'single' | 'multiple';
    is_required: boolean;
    min_selection: number;
    max_selection: number | null;
    items: OptionItem[];
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
    category?: { id: number; name: string };
    option_groups?: {
        id: number;
        name: string;
        selection_type: 'single' | 'multiple';
        is_required: boolean;
        option_items: {
            id: number;
            name: string;
            icon?: string | null;
            additional_price: string;
            is_default: boolean;
            is_active: boolean;
        }[];
    }[];
}

interface Category {
    id: number;
    name: string;
}

interface Props {
    menus: Menu[];
    categories: Category[];
}

function isSizeGroupName(name: string): boolean {
    const lower = name.trim().toLowerCase();
    return (
        lower === 'ukuran' ||
        lower === 'size' ||
        lower.includes('ukuran') ||
        lower.includes('size') ||
        lower.includes('cup') ||
        lower.includes('porsi')
    );
}

function SectionTitle({
    step,
    title,
    action,
}: {
    step: number;
    title: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
                    {step}
                </span>
                <h4 className="text-sm font-extrabold text-foreground">
                    {title}
                </h4>
            </div>
            {action}
        </div>
    );
}

export default function MenusIndex({ menus, categories }: Props) {
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>(
        'all',
    );
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
    const [deletingMenu, setDeletingMenu] = useState<Menu | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // State khusus Modal Kelola Ikon Ukuran Cepat (Dedicated Admin Size Icon Manager)
    const [isIconManagerOpen, setIsIconManagerOpen] = useState(false);
    const [selectedIconMenuId, setSelectedIconMenuId] = useState<string>('all');
    const [iconOverrides, setIconOverrides] = useState<
        Record<number, SizeIconKey>
    >({});
    const [isSavingIcons, setIsSavingIcons] = useState(false);

    // Form state dasar
    const [categoryId, setCategoryId] = useState<string>('');
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [basePrice, setBasePrice] = useState('');
    const [isDiscountActive, setIsDiscountActive] = useState(false);
    const [discountType, setDiscountType] = useState<'percent' | 'fixed'>(
        'percent',
    );
    const [discountValue, setDiscountValue] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [isLimitedStock, setIsLimitedStock] = useState(false);
    const [stockQuantity, setStockQuantity] = useState('0');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Form state grup kustomisasi (Ukuran & Topping)
    const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const formatRupiah = (amount: number | string) => {
        const numeric =
            typeof amount === 'string' ? parseFloat(amount) || 0 : amount || 0;
        return `Rp ${new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(numeric)}`;
    };

    const availableCount = menus.filter(
        (m) =>
            m.is_active && (!m.is_limited_stock || (m.stock_quantity ?? 0) > 0),
    ).length;

    // Daftar menu yang memiliki grup opsi ukuran / varian untuk dikelola ikonnya
    const menusWithOptions = useMemo(
        () =>
            menus.filter(
                (m) =>
                    m.option_groups &&
                    m.option_groups.some(
                        (g) => g.option_items && g.option_items.length > 0,
                    ),
            ),
        [menus],
    );

    const openIconManager = (menuId?: number) => {
        const initialMap: Record<number, SizeIconKey> = {};
        menus.forEach((menu) => {
            menu.option_groups?.forEach((group) => {
                group.option_items.forEach((item, idx) => {
                    initialMap[item.id] = resolveSizeIconKey(
                        item.icon,
                        item.name,
                        idx,
                    );
                });
            });
        });
        setIconOverrides(initialMap);
        setSelectedIconMenuId(menuId ? String(menuId) : 'all');
        setIsIconManagerOpen(true);
    };

    const handleSaveBulkIcons = (e: React.FormEvent) => {
        e.preventDefault();
        const payloadItems = Object.entries(iconOverrides).map(
            ([idStr, iconKey]) => ({
                id: Number(idStr),
                icon: iconKey,
            }),
        );

        if (payloadItems.length === 0) {
            setIsIconManagerOpen(false);
            return;
        }

        setIsSavingIcons(true);
        router.post(
            '/admin/menus/size-icons',
            { items: payloadItems },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setIsSavingIcons(false);
                    setIsIconManagerOpen(false);
                    toast.success('Konfigurasi ikon ukuran berhasil disimpan!');
                },
                onError: (errors) => {
                    setIsSavingIcons(false);
                    toast.error(
                        Object.values(errors)[0] ||
                            'Gagal menyimpan konfigurasi ikon ukuran.',
                    );
                },
            },
        );
    };

    const resetForm = () => {
        setCategoryId(categories[0]?.id.toString() || '');
        setName('');
        setSlug('');
        setDescription('');
        setBasePrice('');
        setIsDiscountActive(false);
        setDiscountType('percent');
        setDiscountValue('');
        setIsActive(true);
        setIsLimitedStock(false);
        setStockQuantity('0');
        setImageFile(null);
        setImagePreview(null);
        setOptionGroups([]);
    };

    const openCreateModal = () => {
        setEditingMenu(null);
        resetForm();
        setIsModalOpen(true);
    };

    const openEditModal = (menu: Menu) => {
        setEditingMenu(menu);
        setCategoryId(menu.category_id.toString());
        setName(menu.name);
        setSlug(menu.slug);
        setDescription(menu.description || '');
        setBasePrice(parseFloat(menu.base_price).toString());
        setIsDiscountActive(Boolean(menu.is_discount_active));
        setDiscountType(menu.discount_type === 'fixed' ? 'fixed' : 'percent');
        setDiscountValue(
            menu.discount_value !== undefined && menu.discount_value !== null
                ? parseFloat(String(menu.discount_value)).toString()
                : '',
        );
        setIsActive(menu.is_active);
        setIsLimitedStock(Boolean(menu.is_limited_stock));
        setStockQuantity(
            menu.stock_quantity !== undefined && menu.stock_quantity !== null
                ? String(menu.stock_quantity)
                : '0',
        );
        setImageFile(null);
        setImagePreview(menu.image_path ? `/storage/${menu.image_path}` : null);

        // Petakan option groups yang ada beserta konfigurasi icon-nya
        if (menu.option_groups) {
            setOptionGroups(
                menu.option_groups.map((g) => ({
                    id: g.id,
                    name: g.name,
                    selection_type: g.selection_type,
                    is_required: g.is_required,
                    min_selection: g.is_required ? 1 : 0,
                    max_selection: g.selection_type === 'single' ? 1 : null,
                    items: g.option_items.map((i, idx) => ({
                        id: i.id,
                        name: i.name,
                        icon: resolveSizeIconKey(i.icon, i.name, idx),
                        additional_price: parseFloat(i.additional_price),
                        is_default: i.is_default,
                        is_active: i.is_active,
                    })),
                })),
            );
        } else {
            setOptionGroups([]);
        }

        setIsModalOpen(true);
    };

    // Handler Grup Opsi (Default: Ukuran Small, Medium, Large dengan ikon cup proporsional)
    const addOptionGroup = () => {
        setOptionGroups([
            ...optionGroups,
            {
                name: 'Ukuran',
                selection_type: 'single',
                is_required: true,
                min_selection: 1,
                max_selection: 1,
                items: [
                    {
                        name: 'Small',
                        icon: 'cup-small',
                        additional_price: 0,
                        is_default: true,
                        is_active: true,
                    },
                    {
                        name: 'Medium',
                        icon: 'cup-medium',
                        additional_price: 4000,
                        is_default: false,
                        is_active: true,
                    },
                    {
                        name: 'Large',
                        icon: 'cup-large',
                        additional_price: 8000,
                        is_default: false,
                        is_active: true,
                    },
                ],
            },
        ]);
    };

    const removeOptionGroup = (groupIndex: number) => {
        setOptionGroups(optionGroups.filter((_, i) => i !== groupIndex));
    };

    const updateGroupField = (
        groupIndex: number,
        field: keyof OptionGroup,
        value: any,
    ) => {
        const updated = [...optionGroups];
        updated[groupIndex] = { ...updated[groupIndex], [field]: value };
        setOptionGroups(updated);
    };

    const addOptionItem = (groupIndex: number) => {
        const updated = [...optionGroups];
        const nextIdx = updated[groupIndex].items.length;
        const defaultIcon = resolveSizeIconKey(null, '', nextIdx);
        updated[groupIndex].items.push({
            name: '',
            icon: defaultIcon,
            additional_price: 0,
            is_default: updated[groupIndex].items.length === 0,
            is_active: true,
        });
        setOptionGroups(updated);
    };

    const removeOptionItem = (groupIndex: number, itemIndex: number) => {
        const updated = [...optionGroups];
        updated[groupIndex].items = updated[groupIndex].items.filter(
            (_, i) => i !== itemIndex,
        );
        setOptionGroups(updated);
    };

    const updateItemField = (
        groupIndex: number,
        itemIndex: number,
        field: keyof OptionItem,
        value: any,
    ) => {
        const updated = [...optionGroups];
        const currentItem = updated[groupIndex].items[itemIndex];

        if (
            field === 'is_default' &&
            value === true &&
            updated[groupIndex].selection_type === 'single'
        ) {
            updated[groupIndex].items = updated[groupIndex].items.map(
                (it, idx) => ({
                    ...it,
                    is_default: idx === itemIndex,
                }),
            );
        } else if (field === 'name') {
            const newName = String(value);
            // Auto-sync icon if name clearly matches Small / Medium / Large
            const autoIcon = resolveSizeIconKey(null, newName, itemIndex);
            const shouldAutoUpdateIcon = [
                'cup-small',
                'cup-medium',
                'cup-large',
            ].includes(currentItem.icon);
            updated[groupIndex].items[itemIndex] = {
                ...currentItem,
                name: newName,
                icon: shouldAutoUpdateIcon ? autoIcon : currentItem.icon,
            };
        } else {
            updated[groupIndex].items[itemIndex] = {
                ...currentItem,
                [field]: value,
            };
        }

        setOptionGroups(updated);
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        const formData = new FormData();
        formData.append('category_id', categoryId);
        formData.append('name', name);
        if (slug) formData.append('slug', slug);
        if (description) formData.append('description', description);
        formData.append('base_price', basePrice);
        formData.append('is_discount_active', isDiscountActive ? '1' : '0');
        if (isDiscountActive) {
            formData.append('discount_type', discountType);
            formData.append('discount_value', discountValue || '0');
        }
        formData.append('is_active', isActive ? '1' : '0');
        formData.append('is_limited_stock', isLimitedStock ? '1' : '0');
        if (isLimitedStock) {
            const parsedStock = Math.max(
                0,
                Number.parseInt(stockQuantity || '0', 10) || 0,
            );
            formData.append('stock_quantity', String(parsedStock));
        }
        if (imageFile) formData.append('image', imageFile);

        // Serialisasi grup opsi beserta konfigurasi icon ukuran
        optionGroups.forEach((group, gIdx) => {
            formData.append(`option_groups[${gIdx}][name]`, group.name);
            formData.append(
                `option_groups[${gIdx}][selection_type]`,
                group.selection_type,
            );
            formData.append(
                `option_groups[${gIdx}][is_required]`,
                group.is_required ? '1' : '0',
            );
            formData.append(
                `option_groups[${gIdx}][min_selection]`,
                group.is_required ? '1' : '0',
            );
            if (group.max_selection) {
                formData.append(
                    `option_groups[${gIdx}][max_selection]`,
                    group.max_selection.toString(),
                );
            }

            group.items.forEach((item, iIdx) => {
                const resolvedIcon = resolveSizeIconKey(
                    item.icon,
                    item.name,
                    iIdx,
                );
                formData.append(
                    `option_groups[${gIdx}][items][${iIdx}][name]`,
                    item.name,
                );
                formData.append(
                    `option_groups[${gIdx}][items][${iIdx}][icon]`,
                    resolvedIcon,
                );
                formData.append(
                    `option_groups[${gIdx}][items][${iIdx}][additional_price]`,
                    item.additional_price.toString(),
                );
                formData.append(
                    `option_groups[${gIdx}][items][${iIdx}][is_default]`,
                    item.is_default ? '1' : '0',
                );
                formData.append(
                    `option_groups[${gIdx}][items][${iIdx}][is_active]`,
                    item.is_active ? '1' : '0',
                );
            });
        });

        if (editingMenu) {
            formData.append('_method', 'PUT');
            router.post(`/admin/menus/${editingMenu.id}`, formData, {
                onSuccess: () => {
                    setIsModalOpen(false);
                    setIsSubmitting(false);
                    toast.success('Menu berhasil diperbarui!');
                },
                onError: (errors) => {
                    setIsSubmitting(false);
                    toast.error(
                        Object.values(errors)[0] ||
                            'Terjadi kesalahan saat menyimpan.',
                    );
                },
            });
        } else {
            router.post('/admin/menus', formData, {
                onSuccess: () => {
                    setIsModalOpen(false);
                    setIsSubmitting(false);
                    resetForm();
                    toast.success('Menu baru berhasil ditambahkan!');
                },
                onError: (errors) => {
                    setIsSubmitting(false);
                    toast.error(
                        Object.values(errors)[0] ||
                            'Terjadi kesalahan saat menyimpan.',
                    );
                },
            });
        }
    };

    const confirmDelete = () => {
        if (!deletingMenu) return;

        setIsDeleting(true);
        router.delete(`/admin/menus/${deletingMenu.id}`, {
            onSuccess: () => toast.success('Menu berhasil dihapus!'),
            onError: (err) =>
                toast.error(Object.values(err)[0] || 'Gagal menghapus menu.'),
            onFinish: () => {
                setIsDeleting(false);
                setDeletingMenu(null);
            },
        });
    };

    const filteredMenus = useMemo(() => {
        const q = search.toLowerCase().trim();

        return menus.filter((m) => {
            const matchCategory =
                selectedCategory === 'all' ||
                m.category_id === selectedCategory;
            const matchSearch =
                !q ||
                m.name.toLowerCase().includes(q) ||
                (m.description ?? '').toLowerCase().includes(q);

            return matchCategory && matchSearch;
        });
    }, [menus, selectedCategory, search]);

    const displayedIconMenus = useMemo(() => {
        if (selectedIconMenuId === 'all') {
            return menusWithOptions;
        }
        return menusWithOptions.filter(
            (m) => String(m.id) === selectedIconMenuId,
        );
    }, [menusWithOptions, selectedIconMenuId]);

    return (
        <>
            <Head title="Manajemen Menu Kafe" />

            <AdminPage>
                <PageHeader
                    icon={Coffee}
                    title="Menu & Produk"
                    description="Kelola produk, harga, foto, serta opsi ukuran dan ikon cup."
                    actions={
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => openIconManager()}
                                className="h-10 gap-2 rounded-xl border-[#DFCFA9] bg-white px-4 font-bold text-[#18181B] shadow-2xs hover:bg-[#FAF5E8]"
                            >
                                <CupSoda className="size-4 text-[#C52828]" />
                                Kelola Ikon Ukuran
                            </Button>
                            <Button
                                onClick={openCreateModal}
                                className="h-10 gap-2 rounded-xl px-4 font-bold shadow-sm"
                            >
                                <Plus className="size-4" />
                                Tambah Menu
                            </Button>
                        </div>
                    }
                />

                <StatGrid>
                    <StatCard
                        icon={Coffee}
                        tone="brand"
                        label="Total Menu"
                        value={menus.length}
                    />
                    <StatCard
                        icon={CheckCircle2}
                        tone="success"
                        label="Tersedia"
                        value={availableCount}
                        hint="Bisa dipesan"
                    />
                    <StatCard
                        icon={XCircle}
                        tone="warning"
                        label="Habis / Nonaktif"
                        value={menus.length - availableCount}
                        hint="Stok 0 atau nonaktif"
                    />
                    <StatCard
                        icon={Layers}
                        tone="neutral"
                        label="Kategori"
                        value={categories.length}
                    />
                </StatGrid>

                {/* Toolbar */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <FilterTabs<number | 'all'>
                        value={selectedCategory}
                        onChange={setSelectedCategory}
                        options={[
                            {
                                value: 'all',
                                label: 'Semua',
                                count: menus.length,
                            },
                            ...categories.map((cat) => ({
                                value: cat.id,
                                label: cat.name,
                                count: menus.filter(
                                    (m) => m.category_id === cat.id,
                                ).length,
                            })),
                        ]}
                    />
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Cari nama menu..."
                    />
                </div>

                {/* Katalog Card Grid */}
                {filteredMenus.length === 0 ? (
                    <Panel>
                        <EmptyState
                            icon={Coffee}
                            title={
                                menus.length === 0
                                    ? 'Belum ada menu'
                                    : 'Menu tidak ditemukan'
                            }
                            description={
                                menus.length === 0
                                    ? 'Tambahkan menu pertama lengkap dengan foto dan harga.'
                                    : 'Tidak ada menu yang cocok dengan filter atau pencarian.'
                            }
                            action={
                                <Button
                                    onClick={openCreateModal}
                                    className="gap-2 rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E]"
                                >
                                    <Plus className="size-4" /> Tambah Menu
                                </Button>
                            }
                        />
                    </Panel>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredMenus.map((menu) => (
                            <div
                                key={menu.id}
                                className="group flex flex-col overflow-hidden rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#DFCFA9] hover:shadow-md"
                            >
                                {/* Foto Menu */}
                                <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#FAF5E8]">
                                    {menu.image_path ? (
                                        <img
                                            src={`/storage/${menu.image_path}`}
                                            alt={menu.name}
                                            className={cn(
                                                'size-full object-cover transition-transform duration-300 group-hover:scale-105',
                                                (!menu.is_active ||
                                                    (menu.is_limited_stock &&
                                                        (menu.stock_quantity ??
                                                            0) <= 0)) &&
                                                    'grayscale-[60%]',
                                            )}
                                        />
                                    ) : (
                                        <div className="flex size-full flex-col items-center justify-center gap-1 text-[#B8A67E]">
                                            <ImageIcon className="size-8 stroke-[1.5]" />
                                            <span className="text-[11px] font-semibold">
                                                Belum ada foto
                                            </span>
                                        </div>
                                    )}
                                    <div className="absolute top-3 left-3 flex flex-col items-start gap-1">
                                        <span className="rounded-full border border-[#E8DFC8] bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#18181B] shadow-xs backdrop-blur">
                                            {menu.category?.name ||
                                                'Tanpa Kategori'}
                                        </span>
                                        {menu.is_discount_active &&
                                            (menu.discount_amount || 0) > 0 && (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-[#C52828]/20 bg-[#C52828] px-2.5 py-0.5 text-[10px] font-extrabold text-white shadow-xs">
                                                    <Flame className="size-3 fill-white text-white" />
                                                    {menu.discount_type ===
                                                    'percent'
                                                        ? `Diskon ${parseFloat(String(menu.discount_value))}%`
                                                        : `Diskon ${formatRupiah(menu.discount_value || 0)}`}
                                                </span>
                                            )}
                                    </div>
                                    <div className="absolute top-3 right-3">
                                        {!menu.is_active ? (
                                            <StatusPill
                                                tone="danger"
                                                dot
                                                className="bg-[#FEE2E2]/95 shadow-xs"
                                            >
                                                Nonaktif
                                            </StatusPill>
                                        ) : menu.is_limited_stock ? (
                                            (menu.stock_quantity ?? 0) <= 0 ? (
                                                <StatusPill
                                                    tone="danger"
                                                    dot
                                                    className="bg-[#FEE2E2]/95 shadow-xs"
                                                >
                                                    Habis
                                                </StatusPill>
                                            ) : (
                                                <StatusPill
                                                    tone={
                                                        (menu.stock_quantity ??
                                                            0) <= 5
                                                            ? 'warning'
                                                            : 'success'
                                                    }
                                                    dot
                                                    className={cn(
                                                        'shadow-xs',
                                                        (menu.stock_quantity ??
                                                            0) <= 5
                                                            ? 'bg-[#FEF3C7]/95'
                                                            : 'bg-[#DCFCE7]/95',
                                                    )}
                                                >
                                                    Stok: {menu.stock_quantity}
                                                </StatusPill>
                                            )
                                        ) : (
                                            <StatusPill
                                                tone="success"
                                                dot
                                                className="bg-[#DCFCE7]/95 shadow-xs"
                                            >
                                                Tersedia
                                            </StatusPill>
                                        )}
                                    </div>
                                </div>

                                {/* Detail */}
                                <div className="flex flex-1 flex-col gap-2.5 p-4">
                                    <h3 className="line-clamp-1 text-base font-extrabold text-[#18181B]">
                                        {menu.name}
                                    </h3>
                                    <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-[#78716C]">
                                        {menu.description ||
                                            'Belum ada deskripsi.'}
                                    </p>

                                    {menu.option_groups &&
                                        menu.option_groups.length > 0 && (
                                            <div className="space-y-1.5 pt-0.5">
                                                {menu.option_groups.map((g) => (
                                                    <div
                                                        key={g.id}
                                                        className="space-y-1 rounded-xl border border-[#EDE3CE] bg-[#FAF6EC] p-2"
                                                    >
                                                        <div className="flex items-center justify-between text-[10px] font-bold text-[#5B4126]">
                                                            <span className="inline-flex items-center gap-1 tracking-wider uppercase">
                                                                <ListChecks className="size-3 text-[#C52828]" />
                                                                {g.name}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    openIconManager(
                                                                        menu.id,
                                                                    )
                                                                }
                                                                className="cursor-pointer text-[10px] font-bold text-[#C52828] hover:underline"
                                                            >
                                                                Atur Ikon
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {g.option_items.map(
                                                                (item, idx) => (
                                                                    <span
                                                                        key={
                                                                            item.id
                                                                        }
                                                                        className="inline-flex items-center gap-1 rounded-lg border border-[#E5DAC2] bg-white px-2 py-1 text-[11px] font-semibold text-[#18181B]"
                                                                    >
                                                                        <SizeOptionIcon
                                                                            icon={
                                                                                item.icon
                                                                            }
                                                                            name={
                                                                                item.name
                                                                            }
                                                                            index={
                                                                                idx
                                                                            }
                                                                            containerClassName="size-4 items-center"
                                                                            className="size-4"
                                                                        />
                                                                        <span>
                                                                            {
                                                                                item.name
                                                                            }
                                                                        </span>
                                                                    </span>
                                                                ),
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                </div>

                                {/* Harga & Aksi */}
                                <div className="flex items-center justify-between gap-2 border-t border-[#E8DFC8] bg-[#FAF6EC] px-4 py-3">
                                    <div>
                                        <p className="text-[10px] font-bold tracking-wide text-[#78716C] uppercase">
                                            Harga
                                        </p>
                                        {menu.is_discount_active &&
                                        (menu.discount_amount || 0) > 0 ? (
                                            <div className="flex flex-col">
                                                <s className="text-[11px] leading-tight font-medium text-[#A8A29E]">
                                                    {formatRupiah(
                                                        menu.base_price,
                                                    )}
                                                </s>
                                                <p className="text-base leading-tight font-black text-[#C52828]">
                                                    {formatRupiah(
                                                        menu.final_price ??
                                                            menu.base_price,
                                                    )}
                                                </p>
                                            </div>
                                        ) : (
                                            <p className="text-base font-black text-[#C52828]">
                                                {formatRupiah(menu.base_price)}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => openEditModal(menu)}
                                            className="h-8 gap-1.5 rounded-lg border-[#DFCFA9] bg-white text-xs font-bold text-[#18181B] hover:bg-[#FAF5E8]"
                                        >
                                            <Pencil className="size-3.5" /> Edit
                                        </Button>
                                        <IconAction
                                            icon={Trash2}
                                            label="Hapus menu"
                                            variant="danger"
                                            onClick={() =>
                                                setDeletingMenu(menu)
                                            }
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </AdminPage>

            {/* ===================================================================== */}
            {/* MODAL 1: TAMBAH / EDIT MENU (Gaya 2 Kolom Standee QR Meja)            */}
            {/* ===================================================================== */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    <form
                        onSubmit={handleSubmit}
                        className="flex max-h-[92dvh] flex-col"
                    >
                        <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                            <FormDialogHeader
                                icon={editingMenu ? Pencil : Coffee}
                                badge="Katalog Menu QR"
                                tag={
                                    editingMenu ? 'EDIT PRODUK' : 'PRODUK BARU'
                                }
                                statusLabel={isActive ? 'Tersedia' : 'Nonaktif'}
                                statusActive={isActive}
                                title={
                                    editingMenu
                                        ? `Edit Menu: ${editingMenu.name}`
                                        : 'Tambah Menu Baru'
                                }
                                description="Atur informasi produk, harga, promo diskon, foto, serta variasi ukuran & ikon cup."
                            />
                        </div>

                        {/* Body 2 Kolom ala Modal QR Code Meja */}
                        <div className="flex-1 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5">
                            <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                {/* KOLOM KIRI: Kartu Standee Preview Menu Live */}
                                <StandeeModalCard
                                    pillPrimary={
                                        categories.find(
                                            (c) => String(c.id) === categoryId,
                                        )?.name || 'KATALOG MENU'
                                    }
                                    pillSecondary={
                                        isActive ? 'Tersedia' : 'Habis'
                                    }
                                    topBadgeIcon={Coffee}
                                    topBadgeLabel={
                                        isDiscountActive &&
                                        (parseFloat(discountValue) || 0) > 0
                                            ? 'PROMO MENU'
                                            : 'FOTO MENU'
                                    }
                                    heading={name || 'Nama Produk Menu'}
                                    subheading={
                                        description ||
                                        'Pilih foto terbaik dan atur rincian harga untuk ditampilkan di menu digital meja pelanggan.'
                                    }
                                    steps={[
                                        {
                                            num: '01',
                                            label: formatRupiah(
                                                parseFloat(basePrice) || 0,
                                            ),
                                        },
                                        {
                                            num: '02',
                                            label:
                                                isDiscountActive &&
                                                (parseFloat(discountValue) ||
                                                    0) > 0
                                                    ? discountType === 'percent'
                                                        ? `Diskon ${discountValue}%`
                                                        : `-${formatRupiah(parseFloat(discountValue) || 0)}`
                                                    : 'Harga Normal',
                                        },
                                        {
                                            num: '03',
                                            label: `${optionGroups.length} Grup Opsi`,
                                        },
                                    ]}
                                    footerSlot={
                                        <label
                                            htmlFor="image"
                                            className="inline-flex w-full max-w-[17rem] cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#E6DFD3] bg-[#FAF8F4] px-3 py-2 text-xs font-bold text-[#1A1A1A] shadow-2xs transition-colors hover:border-[#C52828] hover:bg-[#FDECEB]/50 hover:text-[#C52828]"
                                        >
                                            <Upload className="size-3.5 text-[#C52828]" />
                                            <span>
                                                {imagePreview
                                                    ? 'Ganti Foto Menu'
                                                    : 'Unggah Foto Menu'}
                                            </span>
                                            <input
                                                id="image"
                                                type="file"
                                                accept="image/*"
                                                onChange={handleImageChange}
                                                className="sr-only"
                                            />
                                        </label>
                                    }
                                >
                                    <label
                                        htmlFor="image"
                                        className="group relative flex size-36 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-lg bg-[#FAF5E8] text-center"
                                    >
                                        {imagePreview ? (
                                            <>
                                                <img
                                                    src={imagePreview}
                                                    alt="Preview"
                                                    className="size-full object-cover"
                                                />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[11px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                                                    <Upload className="mr-1 size-3.5" />{' '}
                                                    Ganti
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center gap-1 px-2 text-[#78716C]">
                                                <ImagePlus className="size-7 text-[#C52828]" />
                                                <span className="text-[11px] font-bold text-[#18181B]">
                                                    Pilih Foto
                                                </span>
                                                <span className="text-[9.5px]">
                                                    JPG / PNG
                                                </span>
                                            </div>
                                        )}
                                    </label>
                                </StandeeModalCard>

                                {/* KOLOM KANAN: Panel Informasi & Form ala Card QRIS */}
                                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                    <div className="space-y-3.5">
                                        {/* Banner Preview Produk Gelap ala Card QRIS */}
                                        <div className="flex items-center justify-between gap-3 rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                    MENU
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold tracking-wide text-white uppercase">
                                                        SIDE LINE COFFEE •{' '}
                                                        {name || 'PRODUK BARU'}
                                                    </p>
                                                    <p className="truncate text-[10px] text-white/60">
                                                        {categories.find(
                                                            (c) =>
                                                                String(c.id) ===
                                                                categoryId,
                                                        )?.name ||
                                                            'Pilih Kategori'}{' '}
                                                        •{' '}
                                                        {isActive
                                                            ? isLimitedStock
                                                                ? `Stok Terbatas (${Number.parseInt(stockQuantity || '0', 10) || 0} porsi)`
                                                                : 'Tersedia di Meja'
                                                            : 'Disembunyikan'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[10px] font-medium text-white/60">
                                                    Harga Jual
                                                </p>
                                                <p className="text-sm font-black text-white tabular-nums">
                                                    {formatRupiah(
                                                        isDiscountActive &&
                                                            (parseFloat(
                                                                discountValue,
                                                            ) || 0) > 0
                                                            ? Math.max(
                                                                  0,
                                                                  (parseFloat(
                                                                      basePrice,
                                                                  ) || 0) -
                                                                      (discountType ===
                                                                      'percent'
                                                                          ? Math.round(
                                                                                ((parseFloat(
                                                                                    basePrice,
                                                                                ) ||
                                                                                    0) *
                                                                                    Math.min(
                                                                                        100,
                                                                                        parseFloat(
                                                                                            discountValue,
                                                                                        ) ||
                                                                                            0,
                                                                                    )) /
                                                                                    100,
                                                                            )
                                                                          : parseFloat(
                                                                                discountValue,
                                                                            ) ||
                                                                            0),
                                                              )
                                                            : parseFloat(
                                                                  basePrice,
                                                              ) || 0,
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {/* BAGIAN 1: INFORMASI DASAR */}
                                        <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <Sparkles className="size-3.5 text-[#C52828]" />
                                                    Spesifikasi & Informasi
                                                    Produk
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    Wajib Diisi (*)
                                                </span>
                                            </div>

                                            <div className="grid gap-3">
                                                <div className="grid gap-1.5">
                                                    <Label
                                                        htmlFor="name"
                                                        className="text-xs font-bold text-[#18181B]"
                                                    >
                                                        Nama Menu{' '}
                                                        <span className="text-[#C52828]">
                                                            *
                                                        </span>
                                                    </Label>
                                                    <Input
                                                        id="name"
                                                        value={name}
                                                        onChange={(e) =>
                                                            setName(
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder="Contoh: Caramel Latte"
                                                        className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-sm font-semibold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                                        required
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    <div className="grid gap-1.5">
                                                        <Label
                                                            htmlFor="category"
                                                            className="text-xs font-bold text-[#18181B]"
                                                        >
                                                            Kategori{' '}
                                                            <span className="text-[#C52828]">
                                                                *
                                                            </span>
                                                        </Label>
                                                        <Select
                                                            value={categoryId}
                                                            onValueChange={
                                                                setCategoryId
                                                            }
                                                            required
                                                        >
                                                            <SelectTrigger
                                                                id="category"
                                                                className="h-10 w-full rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-sm font-semibold text-[#18181B]"
                                                            >
                                                                <SelectValue placeholder="Pilih Kategori" />
                                                            </SelectTrigger>
                                                            <SelectContent className="border-[#E8DFC8] bg-[#FFFDF9] text-[#18181B]">
                                                                {categories.map(
                                                                    (c) => (
                                                                        <SelectItem
                                                                            key={
                                                                                c.id
                                                                            }
                                                                            value={c.id.toString()}
                                                                        >
                                                                            {
                                                                                c.name
                                                                            }
                                                                        </SelectItem>
                                                                    ),
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="grid gap-1.5">
                                                        <Label
                                                            htmlFor="price"
                                                            className="text-xs font-bold text-[#18181B]"
                                                        >
                                                            Harga Dasar{' '}
                                                            <span className="text-[#C52828]">
                                                                *
                                                            </span>
                                                        </Label>
                                                        <div className="relative">
                                                            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold text-[#78716C]">
                                                                Rp
                                                            </span>
                                                            <Input
                                                                id="price"
                                                                type="number"
                                                                min="0"
                                                                step="500"
                                                                value={
                                                                    basePrice
                                                                }
                                                                onChange={(e) =>
                                                                    setBasePrice(
                                                                        e.target
                                                                            .value,
                                                                    )
                                                                }
                                                                placeholder="22000"
                                                                className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] pl-9 text-sm font-semibold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                                                required
                                                            />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid gap-1.5">
                                                    <Label
                                                        htmlFor="description"
                                                        className="text-xs font-bold text-[#18181B]"
                                                    >
                                                        Deskripsi Singkat
                                                    </Label>
                                                    <textarea
                                                        id="description"
                                                        value={description}
                                                        onChange={(e) =>
                                                            setDescription(
                                                                e.target.value,
                                                            )
                                                        }
                                                        rows={2}
                                                        placeholder="Perpaduan espresso, susu creamy, dan saus karamel dengan topping lembut."
                                                        className="w-full resize-none rounded-xl border border-[#E6DFD3] bg-[#FAF8F4] px-3 py-2 text-sm text-[#18181B] shadow-2xs outline-none placeholder:text-[#A8A29E] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#C52828]/20"
                                                    />
                                                </div>

                                                <ToggleField
                                                    id="menu_is_active"
                                                    checked={isActive}
                                                    onChange={setIsActive}
                                                    label="Tersedia untuk dipesan"
                                                    description="Matikan jika menu sedang dinonaktifkan dari daftar meja."
                                                />

                                                <ToggleField
                                                    id="menu_is_limited_stock"
                                                    checked={isLimitedStock}
                                                    onChange={(nextChecked) => {
                                                        setIsLimitedStock(
                                                            nextChecked,
                                                        );
                                                        if (
                                                            nextChecked &&
                                                            (!stockQuantity ||
                                                                Number(
                                                                    stockQuantity,
                                                                ) < 0)
                                                        ) {
                                                            setStockQuantity(
                                                                '10',
                                                            );
                                                        }
                                                    }}
                                                    label="Aktifkan Stok Terbatas"
                                                    description="Batasi jumlah porsi & kurangi stok otomatis saat customer checkout."
                                                />

                                                {isLimitedStock && (
                                                    <div className="space-y-2 rounded-xl border border-[#F3DEC0] bg-[#FFF8EC] p-3">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <Label
                                                                htmlFor="menu_stock_quantity"
                                                                className="flex items-center gap-1.5 text-xs font-bold text-[#18181B]"
                                                            >
                                                                <Package className="size-3.5 text-[#C52828]" />
                                                                <span>
                                                                    Jumlah Stok
                                                                    Tersedia{' '}
                                                                    <span className="text-[#C52828]">
                                                                        *
                                                                    </span>
                                                                </span>
                                                            </Label>
                                                            <span
                                                                className={cn(
                                                                    'rounded-md px-2 py-0.5 text-[10px] font-bold',
                                                                    (Number.parseInt(
                                                                        stockQuantity ||
                                                                            '0',
                                                                        10,
                                                                    ) || 0) <= 0
                                                                        ? 'bg-[#FEE2E2] text-[#B91C1C]'
                                                                        : (Number.parseInt(
                                                                                stockQuantity ||
                                                                                    '0',
                                                                                10,
                                                                            ) ||
                                                                                0) <=
                                                                            5
                                                                          ? 'bg-[#FEF3C7] text-[#B45309]'
                                                                          : 'bg-[#DCFCE7] text-[#15803D]',
                                                                )}
                                                            >
                                                                {(Number.parseInt(
                                                                    stockQuantity ||
                                                                        '0',
                                                                    10,
                                                                ) || 0) <= 0
                                                                    ? 'Stok Habis'
                                                                    : `Sisa ${
                                                                          Number.parseInt(
                                                                              stockQuantity ||
                                                                                  '0',
                                                                              10,
                                                                          ) || 0
                                                                      } porsi`}
                                                            </span>
                                                        </div>
                                                        <Input
                                                            id="menu_stock_quantity"
                                                            type="number"
                                                            min="0"
                                                            max="99999"
                                                            step="1"
                                                            value={
                                                                stockQuantity
                                                            }
                                                            onChange={(e) =>
                                                                setStockQuantity(
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="15"
                                                            className="h-10 rounded-xl border-[#E6DFD3] bg-white font-mono text-sm font-bold text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                            required={
                                                                isLimitedStock
                                                            }
                                                        />
                                                        <p className="text-[11px] leading-snug text-[#78716C]">
                                                            Saat stok mencapai
                                                            0, menu tetap tampil
                                                            di pelanggan dengan
                                                            badge Habis dan
                                                            tidak dapat dipesan.
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* BAGIAN 2: PENGATURAN PROMO & DISKON MENU */}
                                        <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                                    <Tag className="size-3.5 text-[#C52828]" />
                                                    Promo & Potongan Harga
                                                </span>
                                                <button
                                                    id="menu_is_discount_active"
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={
                                                        isDiscountActive
                                                    }
                                                    onClick={() => {
                                                        const nextState =
                                                            !isDiscountActive;
                                                        setIsDiscountActive(
                                                            nextState,
                                                        );
                                                        if (
                                                            nextState &&
                                                            !discountValue
                                                        ) {
                                                            setDiscountValue(
                                                                discountType ===
                                                                    'percent'
                                                                    ? '10'
                                                                    : '5000',
                                                            );
                                                        }
                                                    }}
                                                    className={cn(
                                                        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors',
                                                        isDiscountActive
                                                            ? 'bg-[#C52828]'
                                                            : 'bg-[#D6C9AE]',
                                                    )}
                                                >
                                                    <span
                                                        className={cn(
                                                            'inline-block size-5 transform rounded-full bg-white shadow-xs transition-transform',
                                                            isDiscountActive
                                                                ? 'translate-x-5'
                                                                : 'translate-x-0.5',
                                                        )}
                                                    />
                                                </button>
                                            </div>

                                            {!isDiscountActive ? (
                                                <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] px-3 py-2.5 text-[11px] text-[#6E6A64]">
                                                    Aktifkan sakelar di atas
                                                    untuk memberikan diskon
                                                    persen (%) atau potongan
                                                    Rupiah (Rp).
                                                </div>
                                            ) : (
                                                <div className="space-y-3 rounded-xl border border-[#F3C6C6] bg-[#FFF8F6] p-3">
                                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                        <div className="grid gap-1.5">
                                                            <Label className="text-xs font-bold text-[#18181B]">
                                                                Tipe Diskon{' '}
                                                                <span className="text-[#C52828]">
                                                                    *
                                                                </span>
                                                            </Label>
                                                            <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-[#DFCFA9] bg-white p-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setDiscountType(
                                                                            'percent',
                                                                        )
                                                                    }
                                                                    className={cn(
                                                                        'flex cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-all',
                                                                        discountType ===
                                                                            'percent'
                                                                            ? 'bg-[#C52828] text-white shadow-2xs'
                                                                            : 'text-[#5B4126] hover:bg-[#FAF5E8]',
                                                                    )}
                                                                >
                                                                    <Percent className="size-3.5" />
                                                                    <span>
                                                                        Persen
                                                                        (%)
                                                                    </span>
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setDiscountType(
                                                                            'fixed',
                                                                        )
                                                                    }
                                                                    className={cn(
                                                                        'flex cursor-pointer items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold transition-all',
                                                                        discountType ===
                                                                            'fixed'
                                                                            ? 'bg-[#C52828] text-white shadow-2xs'
                                                                            : 'text-[#5B4126] hover:bg-[#FAF5E8]',
                                                                    )}
                                                                >
                                                                    <Tag className="size-3.5" />
                                                                    <span>
                                                                        Nominal
                                                                        (Rp)
                                                                    </span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="grid gap-1.5">
                                                            <Label
                                                                htmlFor="discount_value"
                                                                className="text-xs font-bold text-[#18181B]"
                                                            >
                                                                {discountType ===
                                                                'percent'
                                                                    ? 'Besar Diskon (%)'
                                                                    : 'Potongan Harga (Rp)'}{' '}
                                                                <span className="text-[#C52828]">
                                                                    *
                                                                </span>
                                                            </Label>
                                                            <div className="relative">
                                                                {discountType ===
                                                                    'fixed' && (
                                                                    <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs font-bold text-[#78716C]">
                                                                        Rp
                                                                    </span>
                                                                )}
                                                                <Input
                                                                    id="discount_value"
                                                                    type="number"
                                                                    min="0"
                                                                    max={
                                                                        discountType ===
                                                                        'percent'
                                                                            ? 100
                                                                            : Math.max(
                                                                                  0,
                                                                                  parseFloat(
                                                                                      basePrice,
                                                                                  ) ||
                                                                                      0,
                                                                              )
                                                                    }
                                                                    step={
                                                                        discountType ===
                                                                        'percent'
                                                                            ? '1'
                                                                            : '500'
                                                                    }
                                                                    value={
                                                                        discountValue
                                                                    }
                                                                    onChange={(
                                                                        e,
                                                                    ) =>
                                                                        setDiscountValue(
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        )
                                                                    }
                                                                    placeholder={
                                                                        discountType ===
                                                                        'percent'
                                                                            ? '15'
                                                                            : '5000'
                                                                    }
                                                                    className={cn(
                                                                        'h-9 rounded-xl border-[#DFCFA9] bg-white text-sm font-bold text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20',
                                                                        discountType ===
                                                                            'fixed'
                                                                            ? 'pl-9'
                                                                            : 'pr-9',
                                                                    )}
                                                                    required={
                                                                        isDiscountActive
                                                                    }
                                                                />
                                                                {discountType ===
                                                                    'percent' && (
                                                                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-extrabold text-[#C52828]">
                                                                        %
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[11px] font-bold text-[#78716C]">
                                                            Preset:
                                                        </span>
                                                        {(discountType ===
                                                        'percent'
                                                            ? [
                                                                  {
                                                                      label: '5%',
                                                                      val: '5',
                                                                  },
                                                                  {
                                                                      label: '10%',
                                                                      val: '10',
                                                                  },
                                                                  {
                                                                      label: '15%',
                                                                      val: '15',
                                                                  },
                                                                  {
                                                                      label: '20%',
                                                                      val: '20',
                                                                  },
                                                                  {
                                                                      label: '25%',
                                                                      val: '25',
                                                                  },
                                                                  {
                                                                      label: '50%',
                                                                      val: '50',
                                                                  },
                                                              ]
                                                            : [
                                                                  {
                                                                      label: 'Rp 2.000',
                                                                      val: '2000',
                                                                  },
                                                                  {
                                                                      label: 'Rp 3.000',
                                                                      val: '3000',
                                                                  },
                                                                  {
                                                                      label: 'Rp 5.000',
                                                                      val: '5000',
                                                                  },
                                                                  {
                                                                      label: 'Rp 10.000',
                                                                      val: '10000',
                                                                  },
                                                              ]
                                                        ).map((preset) => (
                                                            <button
                                                                key={preset.val}
                                                                type="button"
                                                                onClick={() =>
                                                                    setDiscountValue(
                                                                        preset.val,
                                                                    )
                                                                }
                                                                className={cn(
                                                                    'cursor-pointer rounded-lg border px-2 py-0.5 text-[11px] font-bold transition',
                                                                    discountValue ===
                                                                        preset.val
                                                                        ? 'border-[#C52828] bg-[#C52828] text-white'
                                                                        : 'border-[#DFCFA9] bg-white text-[#5B4126] hover:bg-[#FAF5E8]',
                                                                )}
                                                            >
                                                                {preset.label}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {(() => {
                                                        const baseNum =
                                                            Math.max(
                                                                0,
                                                                parseFloat(
                                                                    basePrice,
                                                                ) || 0,
                                                            );
                                                        const discValNum =
                                                            Math.max(
                                                                0,
                                                                parseFloat(
                                                                    discountValue,
                                                                ) || 0,
                                                            );
                                                        const cutAmount =
                                                            discountType ===
                                                            'percent'
                                                                ? Math.min(
                                                                      baseNum,
                                                                      Math.round(
                                                                          (baseNum *
                                                                              discValNum) /
                                                                              100,
                                                                      ),
                                                                  )
                                                                : Math.min(
                                                                      baseNum,
                                                                      discValNum,
                                                                  );
                                                        const finalNum =
                                                            Math.max(
                                                                0,
                                                                baseNum -
                                                                    cutAmount,
                                                            );

                                                        return (
                                                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F3C6C6] bg-white px-3 py-2">
                                                                <div className="flex items-center gap-1.5 text-xs">
                                                                    <Flame className="size-3.5 fill-[#C52828] text-[#C52828]" />
                                                                    <s className="text-[11px] font-medium text-[#A8A29E]">
                                                                        {formatRupiah(
                                                                            baseNum,
                                                                        )}
                                                                    </s>
                                                                    <span className="text-xs font-black text-[#C52828]">
                                                                        {formatRupiah(
                                                                            finalNum,
                                                                        )}
                                                                    </span>
                                                                </div>
                                                                <span className="rounded-full bg-[#FDECEB] px-2 py-0.5 text-[10px] font-extrabold text-[#C52828]">
                                                                    Hemat{' '}
                                                                    {formatRupiah(
                                                                        cutAmount,
                                                                    )}
                                                                </span>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>

                                        {/* BAGIAN 3: KUSTOMISASI UKURAN & OPSI */}
                                        <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between">
                                                <span className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                                    <CupSoda className="size-3.5 text-[#C52828]" />
                                                    Opsi Ukuran, Ikon Cup &
                                                    Topping
                                                </span>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={addOptionGroup}
                                                    className="h-7 cursor-pointer gap-1 rounded-lg border-[#E6DFD3] bg-[#FAF8F4] px-2.5 text-[11px] font-bold text-[#C52828] hover:bg-[#FDECEB]/50"
                                                >
                                                    <Plus className="size-3" />{' '}
                                                    Tambah Grup Opsi
                                                </Button>
                                            </div>

                                            {optionGroups.length === 0 ? (
                                                <button
                                                    type="button"
                                                    onClick={addOptionGroup}
                                                    className="flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed border-[#DFCFA9] bg-[#FAF8F4] px-4 py-4 text-center transition-colors hover:border-[#C52828]/50 hover:bg-[#FAF5E8]"
                                                >
                                                    <ListChecks className="size-4 text-[#C52828]" />
                                                    <span className="text-xs font-bold text-[#18181B]">
                                                        Tambah Pilihan Ukuran /
                                                        Topping
                                                    </span>
                                                    <span className="text-[10px] font-medium text-[#78716C]">
                                                        Contoh: Small, Medium,
                                                        Large beserta ikon cup.
                                                    </span>
                                                </button>
                                            ) : (
                                                optionGroups.map(
                                                    (group, gIdx) => {
                                                        const isSizeGroup =
                                                            group.selection_type ===
                                                                'single' ||
                                                            isSizeGroupName(
                                                                group.name,
                                                            );
                                                        const rawBase =
                                                            Math.max(
                                                                0,
                                                                parseFloat(
                                                                    basePrice,
                                                                ) || 0,
                                                            );
                                                        const rawDisc =
                                                            Math.max(
                                                                0,
                                                                parseFloat(
                                                                    discountValue,
                                                                ) || 0,
                                                            );
                                                        const numericBase =
                                                            isDiscountActive
                                                                ? Math.max(
                                                                      0,
                                                                      rawBase -
                                                                          (discountType ===
                                                                          'percent'
                                                                              ? Math.round(
                                                                                    (rawBase *
                                                                                        rawDisc) /
                                                                                        100,
                                                                                )
                                                                              : rawDisc),
                                                                  )
                                                                : rawBase;

                                                        return (
                                                            <div
                                                                key={gIdx}
                                                                className="space-y-3 rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-3"
                                                            >
                                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                                    <Input
                                                                        value={
                                                                            group.name
                                                                        }
                                                                        onChange={(
                                                                            e,
                                                                        ) =>
                                                                            updateGroupField(
                                                                                gIdx,
                                                                                'name',
                                                                                e
                                                                                    .target
                                                                                    .value,
                                                                            )
                                                                        }
                                                                        placeholder="Nama grup (misal: Ukuran, Topping)"
                                                                        className="h-9 flex-1 rounded-lg border-[#DFCFA9] bg-white text-xs font-bold text-[#18181B]"
                                                                        required
                                                                    />
                                                                    <div className="flex items-center gap-1.5">
                                                                        <Select
                                                                            value={
                                                                                group.selection_type
                                                                            }
                                                                            onValueChange={(
                                                                                val,
                                                                            ) =>
                                                                                updateGroupField(
                                                                                    gIdx,
                                                                                    'selection_type',
                                                                                    val,
                                                                                )
                                                                            }
                                                                        >
                                                                            <SelectTrigger className="h-9 w-full rounded-lg border-[#DFCFA9] bg-white text-xs font-semibold sm:w-36">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent className="border-[#E8DFC8] bg-[#FFFDF9] text-[#18181B]">
                                                                                <SelectItem value="single">
                                                                                    Pilih
                                                                                    satu
                                                                                </SelectItem>
                                                                                <SelectItem value="multiple">
                                                                                    Pilih
                                                                                    banyak
                                                                                </SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                        <IconAction
                                                                            icon={
                                                                                Trash2
                                                                            }
                                                                            label="Hapus grup"
                                                                            variant="danger"
                                                                            onClick={() =>
                                                                                removeOptionGroup(
                                                                                    gIdx,
                                                                                )
                                                                            }
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                    <label
                                                                        htmlFor={`req_${gIdx}`}
                                                                        className="flex w-fit cursor-pointer items-center gap-2"
                                                                    >
                                                                        <Checkbox
                                                                            id={`req_${gIdx}`}
                                                                            checked={
                                                                                group.is_required
                                                                            }
                                                                            onCheckedChange={(
                                                                                checked,
                                                                            ) =>
                                                                                updateGroupField(
                                                                                    gIdx,
                                                                                    'is_required',
                                                                                    Boolean(
                                                                                        checked,
                                                                                    ),
                                                                                )
                                                                            }
                                                                        />
                                                                        <span className="text-[11px] font-bold text-[#18181B]">
                                                                            Wajib
                                                                            dipilih
                                                                            pelanggan
                                                                        </span>
                                                                    </label>
                                                                </div>

                                                                <div className="space-y-2 rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] p-2.5">
                                                                    {group.items.map(
                                                                        (
                                                                            item,
                                                                            iIdx,
                                                                        ) => {
                                                                            const resolvedIconKey =
                                                                                resolveSizeIconKey(
                                                                                    item.icon,
                                                                                    item.name,
                                                                                    iIdx,
                                                                                );

                                                                            return (
                                                                                <div
                                                                                    key={
                                                                                        iIdx
                                                                                    }
                                                                                    className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#EFE6D2] bg-[#FAF7F0] p-1.5 sm:flex-nowrap"
                                                                                >
                                                                                    <div
                                                                                        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-[#E4D9C3] bg-white shadow-2xs"
                                                                                        title="Pratinjau Ikon Terpilih"
                                                                                    >
                                                                                        <SizeOptionIcon
                                                                                            icon={
                                                                                                resolvedIconKey
                                                                                            }
                                                                                            name={
                                                                                                item.name
                                                                                            }
                                                                                            index={
                                                                                                iIdx
                                                                                            }
                                                                                        />
                                                                                    </div>

                                                                                    <Select
                                                                                        value={
                                                                                            resolvedIconKey
                                                                                        }
                                                                                        onValueChange={(
                                                                                            val,
                                                                                        ) =>
                                                                                            updateItemField(
                                                                                                gIdx,
                                                                                                iIdx,
                                                                                                'icon',
                                                                                                val as SizeIconKey,
                                                                                            )
                                                                                        }
                                                                                    >
                                                                                        <SelectTrigger
                                                                                            className="h-8 w-32 shrink-0 rounded-lg border-[#DFCFA9] bg-white px-2 text-[11px] font-semibold text-[#18181B]"
                                                                                            aria-label={`Pilih ikon untuk ${item.name || `Ukuran ${iIdx + 1}`}`}
                                                                                        >
                                                                                            <SelectValue placeholder="Pilih Ikon" />
                                                                                        </SelectTrigger>
                                                                                        <SelectContent className="max-h-72 border-[#E8DFC8] bg-[#FFFDF9] text-[#18181B]">
                                                                                            {SIZE_ICON_OPTIONS.map(
                                                                                                (
                                                                                                    iconOpt,
                                                                                                ) => (
                                                                                                    <SelectItem
                                                                                                        key={
                                                                                                            iconOpt.key
                                                                                                        }
                                                                                                        value={
                                                                                                            iconOpt.key
                                                                                                        }
                                                                                                    >
                                                                                                        <span className="inline-flex items-center gap-2">
                                                                                                            <SizeOptionIcon
                                                                                                                icon={
                                                                                                                    iconOpt.key
                                                                                                                }
                                                                                                                containerClassName="size-4 items-center"
                                                                                                                className="size-4"
                                                                                                            />
                                                                                                            <span className="text-xs font-semibold">
                                                                                                                {
                                                                                                                    iconOpt.label
                                                                                                                }
                                                                                                            </span>
                                                                                                        </span>
                                                                                                    </SelectItem>
                                                                                                ),
                                                                                            )}
                                                                                        </SelectContent>
                                                                                    </Select>

                                                                                    <Input
                                                                                        value={
                                                                                            item.name
                                                                                        }
                                                                                        onChange={(
                                                                                            e,
                                                                                        ) =>
                                                                                            updateItemField(
                                                                                                gIdx,
                                                                                                iIdx,
                                                                                                'name',
                                                                                                e
                                                                                                    .target
                                                                                                    .value,
                                                                                            )
                                                                                        }
                                                                                        placeholder="Nama ukuran..."
                                                                                        className="h-8 min-w-[90px] flex-1 rounded-lg border-[#DFCFA9] bg-white text-xs font-semibold text-[#18181B]"
                                                                                        required
                                                                                    />

                                                                                    <div className="relative">
                                                                                        <span className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-[10px] font-bold text-[#78716C]">
                                                                                            +Rp
                                                                                        </span>
                                                                                        <Input
                                                                                            type="number"
                                                                                            min="0"
                                                                                            step="500"
                                                                                            value={
                                                                                                item.additional_price
                                                                                            }
                                                                                            onChange={(
                                                                                                e,
                                                                                            ) =>
                                                                                                updateItemField(
                                                                                                    gIdx,
                                                                                                    iIdx,
                                                                                                    'additional_price',
                                                                                                    parseFloat(
                                                                                                        e
                                                                                                            .target
                                                                                                            .value,
                                                                                                    ) ||
                                                                                                        0,
                                                                                                )
                                                                                            }
                                                                                            className="h-8 w-24 rounded-lg border-[#DFCFA9] bg-white pl-8 text-xs font-semibold text-[#18181B]"
                                                                                        />
                                                                                    </div>

                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            updateItemField(
                                                                                                gIdx,
                                                                                                iIdx,
                                                                                                'is_default',
                                                                                                !item.is_default,
                                                                                            )
                                                                                        }
                                                                                        className={cn(
                                                                                            'h-8 shrink-0 cursor-pointer rounded-lg border px-2 text-[10px] font-bold transition',
                                                                                            item.is_default
                                                                                                ? 'border-[#C52828] bg-[#FDECEB] text-[#C52828]'
                                                                                                : 'border-[#DFCFA9] bg-white text-[#78716C] hover:bg-[#FAF5E8]',
                                                                                        )}
                                                                                    >
                                                                                        {item.is_default
                                                                                            ? 'Default ✓'
                                                                                            : 'Default'}
                                                                                    </button>

                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() =>
                                                                                            removeOptionItem(
                                                                                                gIdx,
                                                                                                iIdx,
                                                                                            )
                                                                                        }
                                                                                        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                                                                                        aria-label="Hapus pilihan"
                                                                                    >
                                                                                        <X className="size-3.5" />
                                                                                    </button>
                                                                                </div>
                                                                            );
                                                                        },
                                                                    )}

                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            addOptionItem(
                                                                                gIdx,
                                                                            )
                                                                        }
                                                                        className="flex h-8 w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-[#DFCFA9] text-[11px] font-bold text-[#C52828] transition-colors hover:bg-[#FDECEC]/50"
                                                                    >
                                                                        <Plus className="size-3" />{' '}
                                                                        Tambah
                                                                        Pilihan
                                                                        Ukuran /
                                                                        Opsi
                                                                    </button>
                                                                </div>

                                                                {isSizeGroup &&
                                                                    group.items
                                                                        .length >
                                                                        0 && (
                                                                        <div className="space-y-2 rounded-xl border border-[#EAE2D3] bg-[#FCFBF7] p-3">
                                                                            <div className="flex items-center justify-between">
                                                                                <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1A1A1A]">
                                                                                    <CupHeaderPhosphorIcon className="size-3.5 text-[#4A2C18]" />
                                                                                    <span>
                                                                                        Preview
                                                                                        Pilihan{' '}
                                                                                        {group.name ||
                                                                                            'Ukuran'}
                                                                                    </span>
                                                                                </div>
                                                                                <span className="inline-flex items-center gap-1 rounded-full bg-[#FDECEB] px-2 py-0.5 text-[9.5px] font-semibold text-[#C52828]">
                                                                                    <Flame className="size-2.5 fill-[#C52828] text-[#C52828]" />
                                                                                    Tampilan
                                                                                    Meja
                                                                                </span>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                                                                                {group.items.map(
                                                                                    (
                                                                                        item,
                                                                                        idx,
                                                                                    ) => {
                                                                                        const isDef =
                                                                                            item.is_default ||
                                                                                            (idx ===
                                                                                                0 &&
                                                                                                !group.items.some(
                                                                                                    (
                                                                                                        x,
                                                                                                    ) =>
                                                                                                        x.is_default,
                                                                                                ));
                                                                                        const fullPrice =
                                                                                            numericBase +
                                                                                            (Number(
                                                                                                item.additional_price,
                                                                                            ) ||
                                                                                                0);

                                                                                        return (
                                                                                            <div
                                                                                                key={
                                                                                                    idx
                                                                                                }
                                                                                                className={cn(
                                                                                                    'relative flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-all',
                                                                                                    isDef
                                                                                                        ? 'border-[1.5px] border-[#C52828] bg-[#FFFDFB]'
                                                                                                        : 'border-[#E8E2D9] bg-[#F6F3EC]',
                                                                                                )}
                                                                                            >
                                                                                                {isDef && (
                                                                                                    <span className="absolute top-1.5 right-1.5 flex size-3.5 items-center justify-center rounded-full bg-[#C52828] text-white">
                                                                                                        <Check className="size-2 stroke-[3]" />
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
                                                                                                        idx
                                                                                                    }
                                                                                                />
                                                                                                <div className="min-w-0">
                                                                                                    <p className="truncate text-[11px] font-medium text-[#3F3A34]">
                                                                                                        {item.name ||
                                                                                                            `Ukuran ${idx + 1}`}
                                                                                                    </p>
                                                                                                    <p className="text-[11px] font-bold text-[#1A1A1A] tabular-nums">
                                                                                                        {formatRupiah(
                                                                                                            fullPrice,
                                                                                                        )}
                                                                                                    </p>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    },
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                            </div>
                                                        );
                                                    },
                                                )
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Footer Bar ala Modal QR Code Meja */}
                        <div className="flex shrink-0 flex-col-reverse gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                    setIsModalOpen(false);
                                    openIconManager(editingMenu?.id);
                                }}
                                className="h-10 cursor-pointer justify-center gap-1.5 rounded-xl text-xs font-bold text-[#B91C1C] hover:bg-[#FDECEB] hover:text-[#B91C1C] sm:justify-start"
                            >
                                <CupSoda className="size-3.5" /> Kelola Ikon
                                Ukuran
                            </Button>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 flex-1 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6] sm:flex-none"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={isSubmitting}
                                >
                                    Tutup
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="h-11 flex-1 cursor-pointer gap-2 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222] sm:flex-none"
                                >
                                    <Check className="size-4" />
                                    {isSubmitting
                                        ? 'Menyimpan...'
                                        : editingMenu
                                          ? 'Simpan Perubahan'
                                          : 'Tambah Menu'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ===================================================================== */}
            {/* MODAL 2: PANEL KHUSUS KELOLA IKON UKURAN PRODUK (Gaya 2 Kolom Standee) */}
            {/* ===================================================================== */}
            <Dialog
                open={isIconManagerOpen}
                onOpenChange={setIsIconManagerOpen}
            >
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    <form
                        onSubmit={handleSaveBulkIcons}
                        className="flex max-h-[92dvh] flex-col"
                    >
                        <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                            <FormDialogHeader
                                icon={CupSoda}
                                badge="Studio Ikon Cup"
                                tag={`${menusWithOptions.length} MENU`}
                                statusLabel="Aktif"
                                statusActive={true}
                                title="Kelola Ikon Ukuran Produk"
                                description="Pilih, pratinjau, dan simpan ikon visual untuk setiap ukuran minuman/makanan di modal pemesanan meja."
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5">
                            <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                {/* KOLOM KIRI: Kartu Standee Preview Ikon Ukuran */}
                                <StandeeModalCard
                                    pillPrimary="STUDIO IKON"
                                    pillSecondary={`${SIZE_ICON_OPTIONS.length} Pilihan`}
                                    topBadgeIcon={CupSoda}
                                    topBadgeLabel="IKON UKURAN"
                                    heading="Visual Ukuran Cup"
                                    subheading="Ikon ini tampil langsung saat pelanggan memilih ukuran Small, Medium, atau Large dari meja."
                                    steps={[
                                        { num: '01', label: 'Pilih Menu' },
                                        { num: '02', label: 'Ganti Ikon' },
                                        { num: '03', label: 'Simpan' },
                                    ]}
                                >
                                    <div className="grid size-36 grid-cols-2 place-items-center gap-2 bg-[#FAF5E8] p-2">
                                        {SIZE_ICON_OPTIONS.slice(0, 4).map(
                                            (opt, idx) => (
                                                <div
                                                    key={opt.key}
                                                    className="flex size-14 flex-col items-center justify-center rounded-xl border border-[#E8DFC8] bg-white p-1 shadow-2xs"
                                                >
                                                    <SizeOptionIcon
                                                        icon={opt.key}
                                                        index={idx}
                                                        containerClassName="size-7 items-center"
                                                        className="size-7"
                                                    />
                                                </div>
                                            ),
                                        )}
                                    </div>
                                </StandeeModalCard>

                                {/* KOLOM KANAN: Panel Konfigurasi Ikon */}
                                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                    <div className="space-y-3.5">
                                        {/* Banner Filter Produk Gelap ala Card QRIS */}
                                        <div className="flex flex-col gap-2.5 rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black text-white">
                                                    CUP
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold tracking-wide text-white uppercase">
                                                        SIDE LINE COFFEE •
                                                        FILTER UKURAN
                                                    </p>
                                                    <p className="text-[10px] text-white/60">
                                                        Sinkron otomatis dengan
                                                        kartu pemesanan QR meja
                                                    </p>
                                                </div>
                                            </div>
                                            <Select
                                                value={selectedIconMenuId}
                                                onValueChange={
                                                    setSelectedIconMenuId
                                                }
                                            >
                                                <SelectTrigger className="h-9 w-full rounded-xl border-white/15 bg-white/10 text-xs font-semibold text-white sm:w-56">
                                                    <SelectValue placeholder="Semua Produk dengan Ukuran" />
                                                </SelectTrigger>
                                                <SelectContent className="border-[#E8E2D9] bg-[#FFFDFB] text-[#1A1A1A]">
                                                    <SelectItem value="all">
                                                        Semua Produk (
                                                        {
                                                            menusWithOptions.length
                                                        }{' '}
                                                        Menu)
                                                    </SelectItem>
                                                    {menusWithOptions.map(
                                                        (m) => (
                                                            <SelectItem
                                                                key={m.id}
                                                                value={String(
                                                                    m.id,
                                                                )}
                                                            >
                                                                {m.name}
                                                            </SelectItem>
                                                        ),
                                                    )}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {displayedIconMenus.length === 0 ? (
                                            <div className="rounded-xl border border-dashed border-[#E6DFD3] bg-[#FFFDFB] p-8 text-center">
                                                <p className="text-sm font-bold text-[#1A1A1A]">
                                                    Belum ada produk dengan opsi
                                                    ukuran.
                                                </p>
                                                <p className="mt-1 text-xs text-[#6E6A64]">
                                                    Tambahkan grup opsi Ukuran
                                                    pada menu terlebih dahulu
                                                    melalui tombol Edit pada
                                                    kartu menu.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3.5">
                                                {displayedIconMenus.map(
                                                    (menu) => {
                                                        const numericBase =
                                                            parseFloat(
                                                                menu.base_price,
                                                            ) || 0;

                                                        return (
                                                            <div
                                                                key={menu.id}
                                                                className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]"
                                                            >
                                                                <div className="flex items-center justify-between gap-2 border-b border-[#EFEAE0] pb-2.5">
                                                                    <div>
                                                                        <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-[#1A1A1A]">
                                                                            <Sparkles className="size-3.5 text-[#C52828]" />
                                                                            {
                                                                                menu.name
                                                                            }
                                                                        </h4>
                                                                        <p className="text-[11px] font-semibold text-[#C52828]">
                                                                            Harga
                                                                            Dasar:{' '}
                                                                            {formatRupiah(
                                                                                menu.base_price,
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                    <Button
                                                                        type="button"
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() => {
                                                                            setIsIconManagerOpen(
                                                                                false,
                                                                            );
                                                                            openEditModal(
                                                                                menu,
                                                                            );
                                                                        }}
                                                                        className="h-8 cursor-pointer rounded-lg border-[#E6DFD3] bg-[#FAF8F4] text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                                                    >
                                                                        <Pencil className="mr-1.5 size-3" />
                                                                        Edit
                                                                        Menu
                                                                    </Button>
                                                                </div>

                                                                {menu.option_groups?.map(
                                                                    (group) => (
                                                                        <div
                                                                            key={
                                                                                group.id
                                                                            }
                                                                            className="space-y-2.5"
                                                                        >
                                                                            <div className="text-[11px] font-bold tracking-wider text-[#5B4126] uppercase">
                                                                                Grup:{' '}
                                                                                {
                                                                                    group.name
                                                                                }
                                                                            </div>

                                                                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                                                                                {group.option_items.map(
                                                                                    (
                                                                                        item,
                                                                                        idx,
                                                                                    ) => {
                                                                                        const currentIcon =
                                                                                            iconOverrides[
                                                                                                item
                                                                                                    .id
                                                                                            ] ??
                                                                                            resolveSizeIconKey(
                                                                                                item.icon,
                                                                                                item.name,
                                                                                                idx,
                                                                                            );
                                                                                        const fullPrice =
                                                                                            numericBase +
                                                                                            (parseFloat(
                                                                                                item.additional_price,
                                                                                            ) ||
                                                                                                0);

                                                                                        return (
                                                                                            <div
                                                                                                key={
                                                                                                    item.id
                                                                                                }
                                                                                                className="flex flex-col justify-between gap-2.5 rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-3"
                                                                                            >
                                                                                                <div className="relative flex items-center gap-2.5 rounded-xl border-[1.5px] border-[#C52828] bg-[#FFFDFB] p-2.5">
                                                                                                    <span className="absolute top-2 right-2 flex size-4 items-center justify-center rounded-full bg-[#C52828] text-white">
                                                                                                        <Check className="size-2.5 stroke-[3]" />
                                                                                                    </span>
                                                                                                    <SizeOptionIcon
                                                                                                        icon={
                                                                                                            currentIcon
                                                                                                        }
                                                                                                        name={
                                                                                                            item.name
                                                                                                        }
                                                                                                        index={
                                                                                                            idx
                                                                                                        }
                                                                                                    />
                                                                                                    <div className="min-w-0">
                                                                                                        <p className="truncate text-xs font-medium text-[#3F3A34]">
                                                                                                            {
                                                                                                                item.name
                                                                                                            }
                                                                                                        </p>
                                                                                                        <p className="text-xs font-bold text-[#1A1A1A] tabular-nums">
                                                                                                            {formatRupiah(
                                                                                                                fullPrice,
                                                                                                            )}
                                                                                                        </p>
                                                                                                    </div>
                                                                                                </div>

                                                                                                <div className="space-y-1">
                                                                                                    <Label className="text-[10px] font-bold text-[#6E6A64]">
                                                                                                        Pilih
                                                                                                        Ikon{' '}
                                                                                                        {
                                                                                                            item.name
                                                                                                        }
                                                                                                    </Label>
                                                                                                    <Select
                                                                                                        value={
                                                                                                            currentIcon
                                                                                                        }
                                                                                                        onValueChange={(
                                                                                                            val,
                                                                                                        ) =>
                                                                                                            setIconOverrides(
                                                                                                                (
                                                                                                                    prev,
                                                                                                                ) => ({
                                                                                                                    ...prev,
                                                                                                                    [item.id]:
                                                                                                                        val as SizeIconKey,
                                                                                                                }),
                                                                                                            )
                                                                                                        }
                                                                                                    >
                                                                                                        <SelectTrigger className="h-8 w-full rounded-lg border-[#E6DFD3] bg-[#FFFDFB] text-xs font-semibold text-[#1A1A1A]">
                                                                                                            <SelectValue />
                                                                                                        </SelectTrigger>
                                                                                                        <SelectContent className="max-h-72 border-[#E8E2D9] bg-[#FFFDFB] text-[#1A1A1A]">
                                                                                                            {SIZE_ICON_OPTIONS.map(
                                                                                                                (
                                                                                                                    iconOpt,
                                                                                                                ) => (
                                                                                                                    <SelectItem
                                                                                                                        key={
                                                                                                                            iconOpt.key
                                                                                                                        }
                                                                                                                        value={
                                                                                                                            iconOpt.key
                                                                                                                        }
                                                                                                                    >
                                                                                                                        <span className="inline-flex items-center gap-2">
                                                                                                                            <SizeOptionIcon
                                                                                                                                icon={
                                                                                                                                    iconOpt.key
                                                                                                                                }
                                                                                                                                containerClassName="size-4 items-center"
                                                                                                                                className="size-4"
                                                                                                                            />
                                                                                                                            <span className="text-xs font-semibold">
                                                                                                                                {
                                                                                                                                    iconOpt.label
                                                                                                                                }
                                                                                                                            </span>
                                                                                                                        </span>
                                                                                                                    </SelectItem>
                                                                                                                ),
                                                                                                            )}
                                                                                                        </SelectContent>
                                                                                                    </Select>
                                                                                                </div>
                                                                                            </div>
                                                                                        );
                                                                                    },
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ),
                                                                )}
                                                            </div>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                            <span className="hidden text-xs font-semibold text-[#6E6A64] sm:inline">
                                Perubahan ikon langsung berlaku di halaman
                                pemesanan meja
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                    onClick={() => setIsIconManagerOpen(false)}
                                    disabled={isSavingIcons}
                                >
                                    Tutup
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={
                                        isSavingIcons ||
                                        displayedIconMenus.length === 0
                                    }
                                    className="h-11 cursor-pointer gap-2 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                                >
                                    <Check className="size-4" />
                                    {isSavingIcons
                                        ? 'Menyimpan...'
                                        : 'Simpan Konfigurasi Ikon'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deletingMenu}
                onOpenChange={(open) => !open && setDeletingMenu(null)}
                title="Hapus menu?"
                description={
                    <>
                        Menu{' '}
                        <b className="font-extrabold text-[#18181B]">
                            {deletingMenu?.name}
                        </b>{' '}
                        akan dihapus permanen dari katalog.
                    </>
                }
                onConfirm={confirmDelete}
                processing={isDeleting}
            />
        </>
    );
}

MenusIndex.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: '/dashboard',
        },
        {
            title: 'Menu & Produk',
            href: '/admin/menus',
        },
    ],
};
