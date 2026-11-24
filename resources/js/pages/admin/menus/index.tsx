import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    Clock,
    Coffee,
    CupSoda,
    Flame,
    ImagePlus,
    Image as ImageIcon,
    ListChecks,
    Package,
    Pencil,
    Percent,
    Plus,
    RefreshCw,
    Sparkles,
    Tag,
    Trash2,
    Upload,
    X,
    XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import CategoryManagerSection, {
    type CategoryRecord,
} from '@/components/admin/CategoryManagerSection';
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
import { Dialog, DialogContent } from '@/components/ui/dialog';
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
    cost_price?: string | number | null;
    gross_margin_amount?: number | null;
    gross_margin_percent?: number | null;
    is_discount_active?: boolean;
    discount_type?: 'percent' | 'fixed' | null;
    discount_value?: string | number | null;
    final_price?: number;
    discount_amount?: number;
    is_active: boolean;
    is_limited_stock?: boolean;
    stock_quantity?: number;
    effective_stock_quantity?: number;
    stock_valid_days?: number;
    stock_updated_at?: string | null;
    stock_updated_at_label?: string | null;
    stock_valid_until_label?: string | null;
    is_stock_expired?: boolean;
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
    categoriesList?: CategoryRecord[];
    initialTab?: 'menus' | 'categories';
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

export default function MenusIndex({
    menus,
    categories,
    categoriesList = [],
    initialTab = 'menus',
}: Props) {
    const [activeSection, setActiveSection] = useState<'menus' | 'categories'>(
        initialTab,
    );
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>(
        'all',
    );
    const [onlyExpiredStock, setOnlyExpiredStock] = useState<boolean>(() => {
        if (typeof window === 'undefined') return false;
        return (
            new URLSearchParams(window.location.search).get('filter') ===
            'expired_stock'
        );
    });
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
    const [deletingMenu, setDeletingMenu] = useState<Menu | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // State khusus Modal Update Stok Cepat
    const [quickStockMenu, setQuickStockMenu] = useState<Menu | null>(null);
    const [quickStockQty, setQuickStockQty] = useState('0');
    const [quickStockValidDays, setQuickStockValidDays] = useState('1');
    const [isUpdatingQuickStock, setIsUpdatingQuickStock] = useState(false);

    // State khusus Modal Kelola Ikon Ukuran Cepat (Dedicated Admin Size Icon Manager)
    const [isIconManagerOpen, setIsIconManagerOpen] = useState(false);
    const [
        returnToMenuModalAfterIconManager,
        setReturnToMenuModalAfterIconManager,
    ] = useState(false);
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
    const [stockValidDays, setStockValidDays] = useState('1');
    const [refreshStockTimestamp, setRefreshStockTimestamp] = useState(true);
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
            m.is_active &&
            (!m.is_limited_stock ||
                (!m.is_stock_expired &&
                    (m.effective_stock_quantity ?? m.stock_quantity ?? 0) > 0)),
    ).length;

    const expiredStockMenus = useMemo(
        () =>
            menus.filter(
                (m) =>
                    m.is_active &&
                    Boolean(m.is_limited_stock) &&
                    Boolean(m.is_stock_expired),
            ),
        [menus],
    );

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

    const openIconManager = (menuId?: number, returnToMenuModal = false) => {
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
        setReturnToMenuModalAfterIconManager(returnToMenuModal);
        setIsIconManagerOpen(true);
    };

    const closeIconManager = () => {
        const shouldReturnToMenuModal = returnToMenuModalAfterIconManager;
        setIsIconManagerOpen(false);
        setReturnToMenuModalAfterIconManager(false);
        if (shouldReturnToMenuModal) {
            setIsModalOpen(true);
        }
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
            closeIconManager();
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
                    setOptionGroups((prev) =>
                        prev.map((group) => ({
                            ...group,
                            items: group.items.map((item) =>
                                item.id && iconOverrides[item.id]
                                    ? { ...item, icon: iconOverrides[item.id] }
                                    : item,
                            ),
                        })),
                    );
                    closeIconManager();
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
        setStockValidDays('1');
        setRefreshStockTimestamp(true);
        setImageFile(null);
        setImagePreview(null);
        setOptionGroups([]);
    };

    const openQuickStockModal = (menu: Menu) => {
        setQuickStockMenu(menu);
        setQuickStockQty(
            menu.stock_quantity !== undefined && menu.stock_quantity !== null
                ? String(menu.stock_quantity)
                : '0',
        );
        setQuickStockValidDays(String(menu.stock_valid_days ?? 1));
    };

    const handleQuickStockSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!quickStockMenu) return;

        const parsedQty = Math.max(
            0,
            Number.parseInt(quickStockQty || '0', 10) || 0,
        );
        const parsedDays = Math.max(
            1,
            Math.min(365, Number.parseInt(quickStockValidDays || '1', 10) || 1),
        );

        setIsUpdatingQuickStock(true);
        router.post(
            `/admin/menus/${quickStockMenu.id}/stock`,
            {
                stock_quantity: parsedQty,
                stock_valid_days: parsedDays,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    const updatedWasLastExpired =
                        onlyExpiredStock &&
                        expiredStockMenus.filter(
                            (m) => m.id !== quickStockMenu.id,
                        ).length === 0;
                    if (updatedWasLastExpired) {
                        setOnlyExpiredStock(false);
                    }
                    toast.success(
                        `Stok ${quickStockMenu.name} diperbarui (${parsedQty} porsi, berlaku ${parsedDays} hari).`,
                    );
                    setQuickStockMenu(null);
                },
                onError: (errors) => {
                    toast.error(
                        Object.values(errors)[0] ||
                            'Gagal memperbarui stok menu.',
                    );
                },
                onFinish: () => {
                    setIsUpdatingQuickStock(false);
                },
            },
        );
    };

    const openCreateModal = () => {
        setReturnToMenuModalAfterIconManager(false);
        setEditingMenu(null);
        resetForm();
        setIsModalOpen(true);
    };

    const openEditModal = (menu: Menu) => {
        setReturnToMenuModalAfterIconManager(false);
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
        setStockValidDays(String(menu.stock_valid_days ?? 1));
        setRefreshStockTimestamp(Boolean(menu.is_stock_expired));
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
            const parsedValidDays = Math.max(
                1,
                Math.min(365, Number.parseInt(stockValidDays || '1', 10) || 1),
            );
            formData.append('stock_quantity', String(parsedStock));
            formData.append('stock_valid_days', String(parsedValidDays));
            formData.append(
                'refresh_stock_timestamp',
                refreshStockTimestamp ? '1' : '0',
            );
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
            const matchExpired =
                !onlyExpiredStock ||
                (m.is_active &&
                    Boolean(m.is_limited_stock) &&
                    Boolean(m.is_stock_expired));

            return matchCategory && matchSearch && matchExpired;
        });
    }, [menus, selectedCategory, search, onlyExpiredStock]);

    const displayedIconMenus = useMemo(() => {
        if (selectedIconMenuId === 'all') {
            return menusWithOptions;
        }
        return menusWithOptions.filter(
            (m) => String(m.id) === selectedIconMenuId,
        );
    }, [menusWithOptions, selectedIconMenuId]);

    const promoCount = menus.filter(
        (m) => m.is_discount_active && (m.discount_amount || 0) > 0,
    ).length;

    const hasAnyLimitedStockMenu = menus.some((m) => m.is_limited_stock);

    return (
        <>
            <Head title="Menu & Kategori • Admin Café SIDE LINE" />

            <AdminPage>
                <PageHeader
                    icon={Coffee}
                    title="Menu & Kategori"
                    description="Kelola katalog menu, harga jual, diskon promo, variasi ukuran & stok."
                    actions={
                        activeSection === 'menus' ? (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => openIconManager()}
                                    className="h-9 shrink-0 gap-1.5 rounded-xl border-[#DFCFA9] bg-white px-3.5 text-xs font-bold whitespace-nowrap text-[#18181B] shadow-2xs hover:bg-[#FAF5E8]"
                                >
                                    <CupSoda className="size-3.5 text-[#C52828]" />
                                    Kelola Ikon Ukuran
                                </Button>
                                <Button
                                    onClick={openCreateModal}
                                    className="h-9 shrink-0 gap-1.5 rounded-xl px-3.5 text-xs font-bold whitespace-nowrap shadow-sm"
                                >
                                    <Plus className="size-3.5" />
                                    Tambah Menu
                                </Button>
                            </>
                        ) : undefined
                    }
                />

                {/* Tab Utama Terpadu: Daftar Menu vs Kategori Menu */}
                <FilterTabs<'menus' | 'categories'>
                    value={activeSection}
                    onChange={(tab) => {
                        setActiveSection(tab);
                        if (typeof window !== 'undefined') {
                            const url = new URL(window.location.href);
                            url.searchParams.set('tab', tab);
                            window.history.replaceState({}, '', url.toString());
                        }
                    }}
                    options={[
                        {
                            value: 'menus',
                            label: 'Daftar Menu',
                            count: menus.length,
                        },
                        {
                            value: 'categories',
                            label: 'Kategori Menu',
                            count: categoriesList.length || categories.length,
                        },
                    ]}
                />

                {activeSection === 'categories' ? (
                    <CategoryManagerSection categories={categoriesList} />
                ) : (
                    <>
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
                                hint={
                                    expiredStockMenus.length > 0
                                        ? `${expiredStockMenus.length} perlu update stok`
                                        : 'Stok 0 atau nonaktif'
                                }
                            />
                            <StatCard
                                icon={Percent}
                                tone="neutral"
                                label="Menu Promo"
                                value={promoCount}
                                hint="Diskon aktif di katalog"
                            />
                        </StatGrid>

                        {expiredStockMenus.length > 0 ? (
                            <div className="flex flex-col gap-3 rounded-2xl border border-[#F5C2C0] bg-[#FEF2F2] p-3.5 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex items-start gap-2.5">
                                    <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#C52828]" />
                                    <div className="text-xs">
                                        <p className="font-extrabold text-[#991B1B]">
                                            {expiredStockMenus.length} Menu
                                            Perlu Update Stok Hari Ini
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-[#7F1D1D]">
                                            Masa berlaku stok telah lewat.
                                            Pelanggan otomatis melihat status{' '}
                                            <span className="font-bold">
                                                Habis
                                            </span>{' '}
                                            hingga Admin memperbarui stok (cek
                                            dan update stok setiap hari).
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                        onlyExpiredStock ? 'default' : 'outline'
                                    }
                                    onClick={() =>
                                        setOnlyExpiredStock((prev) => !prev)
                                    }
                                    className={cn(
                                        'h-8 shrink-0 gap-1.5 rounded-xl text-xs font-bold whitespace-nowrap',
                                        onlyExpiredStock
                                            ? 'bg-[#C52828] text-white hover:bg-[#A81E1E]'
                                            : 'border-[#FCA5A5] bg-white text-[#991B1B] hover:bg-[#FEE2E2]',
                                    )}
                                >
                                    <RefreshCw className="size-3.5" />
                                    {onlyExpiredStock
                                        ? 'Tampilkan Semua Menu'
                                        : `Filter ${expiredStockMenus.length} Perlu Update`}
                                </Button>
                            </div>
                        ) : hasAnyLimitedStockMenu ? (
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] px-3.5 py-2 text-[11px] text-[#5B4126]">
                                <span className="flex items-center gap-2 font-medium">
                                    <Clock className="size-3.5 shrink-0 text-[#B45309]" />
                                    <span>
                                        <strong className="font-bold text-[#18181B]">
                                            Pengingat Stok Harian:
                                        </strong>{' '}
                                        Disarankan memperbarui stok menu
                                        terbatas setiap hari (atau atur masa
                                        berlaku hari sesuai kebutuhan). Jika
                                        terlewat, menu otomatis bertanda Habis
                                        di pelanggan.
                                    </span>
                                </span>
                            </div>
                        ) : null}

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
                                            : onlyExpiredStock
                                              ? 'Semua menu stok terbatas sudah diperbarui dan masih berlaku.'
                                              : 'Tidak ada menu yang cocok dengan filter atau pencarian.'
                                    }
                                    action={
                                        onlyExpiredStock ? (
                                            <Button
                                                type="button"
                                                onClick={() =>
                                                    setOnlyExpiredStock(false)
                                                }
                                                className="gap-2 rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E]"
                                            >
                                                Tampilkan Semua Menu
                                            </Button>
                                        ) : (
                                            <Button
                                                onClick={openCreateModal}
                                                className="gap-2 rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E]"
                                            >
                                                <Plus className="size-4" />{' '}
                                                Tambah Menu
                                            </Button>
                                        )
                                    }
                                />
                            </Panel>
                        ) : (
                            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                {filteredMenus.map((menu) => {
                                    const activeOptionGroups = (
                                        menu.option_groups ?? []
                                    ).filter(
                                        (g) =>
                                            g.option_items &&
                                            g.option_items.length > 0,
                                    );
                                    const optionGroupCount =
                                        activeOptionGroups.length;
                                    const optionItemCount =
                                        activeOptionGroups.reduce(
                                            (sum, g) =>
                                                sum + g.option_items.length,
                                            0,
                                        );
                                    const isStockExpired = Boolean(
                                        menu.is_limited_stock &&
                                        menu.is_stock_expired,
                                    );

                                    return (
                                        <div
                                            key={menu.id}
                                            className="group flex flex-col overflow-hidden rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#DFCFA9] hover:shadow-md"
                                        >
                                            {/* Foto Menu (Klik untuk lihat detail, varian ukuran & edit) */}
                                            <div className="relative aspect-[4/3] w-full overflow-hidden bg-[#FAF5E8]">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        openEditModal(menu)
                                                    }
                                                    className="block size-full cursor-pointer text-left focus:outline-none"
                                                    title={`Lihat detail & varian ${menu.name}`}
                                                >
                                                    {menu.image_path ? (
                                                        <img
                                                            src={`/storage/${menu.image_path}`}
                                                            alt={menu.name}
                                                            className={cn(
                                                                'size-full object-cover transition-transform duration-300 group-hover:scale-105',
                                                                (!menu.is_active ||
                                                                    (menu.is_limited_stock &&
                                                                        (isStockExpired ||
                                                                            (menu.stock_quantity ??
                                                                                0) <=
                                                                                0))) &&
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
                                                </button>
                                                <div className="pointer-events-none absolute top-2.5 left-2.5 flex flex-col items-start gap-1">
                                                    <span className="rounded-md border border-[#E8DFC8] bg-white/95 px-2.5 py-0.5 text-[10.5px] font-bold text-[#18181B] shadow-xs backdrop-blur">
                                                        {menu.category?.name ||
                                                            'Tanpa Kategori'}
                                                    </span>
                                                    {menu.is_discount_active &&
                                                        (menu.discount_amount ||
                                                            0) > 0 && (
                                                            <span className="inline-flex items-center gap-1 rounded-md border border-[#C52828]/20 bg-[#C52828] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-xs">
                                                                <Flame className="size-2.5 fill-white text-white" />
                                                                {menu.discount_type ===
                                                                'percent'
                                                                    ? `Diskon ${parseFloat(String(menu.discount_value))}%`
                                                                    : `Diskon ${formatRupiah(menu.discount_value || 0)}`}
                                                            </span>
                                                        )}
                                                </div>
                                                <div className="pointer-events-none absolute top-2.5 right-2.5">
                                                    {!menu.is_active ? (
                                                        <StatusPill
                                                            tone="danger"
                                                            dot
                                                            className="bg-[#FEE2E2]/95 shadow-xs"
                                                        >
                                                            Nonaktif
                                                        </StatusPill>
                                                    ) : menu.is_limited_stock ? (
                                                        isStockExpired ? (
                                                            <StatusPill
                                                                tone="danger"
                                                                dot
                                                                className="bg-[#FEE2E2]/95 shadow-xs"
                                                            >
                                                                Perlu Update
                                                            </StatusPill>
                                                        ) : (menu.stock_quantity ??
                                                              0) <= 0 ? (
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
                                                                Stok:{' '}
                                                                {
                                                                    menu.stock_quantity
                                                                }
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
                                                {optionItemCount > 0 && (
                                                    <div className="pointer-events-none absolute bottom-2.5 left-2.5">
                                                        <span className="inline-flex items-center gap-1 rounded-md border border-[#E8DFC8] bg-white/95 px-2.5 py-0.5 text-[10.5px] font-bold text-[#18181B] shadow-xs backdrop-blur">
                                                            <CupSoda className="size-3 shrink-0 text-[#C52828]" />
                                                            <span>
                                                                {
                                                                    optionGroupCount
                                                                }{' '}
                                                                Varian &bull;{' '}
                                                                {
                                                                    optionItemCount
                                                                }{' '}
                                                                Opsi
                                                            </span>
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Detail Minimalis */}
                                            <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        openEditModal(menu)
                                                    }
                                                    className="cursor-pointer text-left focus:outline-none"
                                                >
                                                    <h3 className="line-clamp-1 text-[15px] font-extrabold text-[#18181B] transition-colors group-hover:text-[#C52828]">
                                                        {menu.name}
                                                    </h3>
                                                </button>
                                                <p className="line-clamp-2 min-h-[2.125rem] text-xs leading-snug text-[#78716C]">
                                                    {menu.description ||
                                                        'Belum ada deskripsi.'}
                                                </p>

                                                {menu.is_limited_stock && (
                                                    <div
                                                        className={cn(
                                                            'mt-1 flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[10.5px]',
                                                            isStockExpired
                                                                ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                                                                : 'border-[#EFE5CF] bg-[#FAF6EC] text-[#5B4126]',
                                                        )}
                                                    >
                                                        <span className="min-w-0 truncate font-semibold">
                                                            {isStockExpired
                                                                ? `Habis di meja (lama ${menu.stock_quantity ?? 0})`
                                                                : `Berlaku s/d ${menu.stock_valid_until_label ?? 'Hari ini'} (${menu.stock_valid_days ?? 1} hr)`}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                openQuickStockModal(
                                                                    menu,
                                                                )
                                                            }
                                                            className={cn(
                                                                'inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-extrabold transition',
                                                                isStockExpired
                                                                    ? 'bg-[#C52828] text-white hover:bg-[#A81E1E]'
                                                                    : 'border border-[#DFCFA9] bg-white text-[#18181B] hover:bg-[#F5EEDC]',
                                                            )}
                                                        >
                                                            <RefreshCw className="size-2.5" />
                                                            Update Stok
                                                        </button>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Harga & Aksi */}
                                            <div className="flex items-center justify-between gap-2 border-t border-[#E8DFC8] bg-[#FAF6EC] px-3.5 py-2.5">
                                                <div>
                                                    <p className="text-[9.5px] font-bold tracking-wide text-[#78716C] uppercase">
                                                        Harga
                                                    </p>
                                                    {menu.is_discount_active &&
                                                    (menu.discount_amount ||
                                                        0) > 0 ? (
                                                        <div className="flex flex-col">
                                                            <s className="text-[11px] leading-tight font-medium text-[#A8A29E]">
                                                                {formatRupiah(
                                                                    menu.base_price,
                                                                )}
                                                            </s>
                                                            <p className="text-[15px] leading-tight font-black text-[#C52828] tabular-nums">
                                                                {formatRupiah(
                                                                    menu.final_price ??
                                                                        menu.base_price,
                                                                )}
                                                            </p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[15px] font-black text-[#C52828] tabular-nums">
                                                            {formatRupiah(
                                                                menu.base_price,
                                                            )}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() =>
                                                            openEditModal(menu)
                                                        }
                                                        className="h-8 gap-1.5 rounded-lg border-[#DFCFA9] bg-white px-2.5 text-xs font-bold text-[#18181B] hover:bg-[#FAF5E8]"
                                                    >
                                                        <Pencil className="size-3.5" />{' '}
                                                        Edit
                                                    </Button>
                                                    <IconAction
                                                        icon={Trash2}
                                                        label="Hapus menu"
                                                        variant="danger"
                                                        onClick={() =>
                                                            setDeletingMenu(
                                                                menu,
                                                            )
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </AdminPage>

            {/* ===================================================================== */}
            {/* MODAL 1: TAMBAH / EDIT MENU (Gaya 2 Kolom Standee QR Meja)            */}
            {/* ===================================================================== */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="flex max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-6xl">
                    <form
                        onSubmit={handleSubmit}
                        className="flex max-h-[94dvh] min-h-0 flex-col overflow-hidden"
                    >
                        <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-6 pt-4 pb-3.5">
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

                        {/* Body 2 Kolom: Kolom kiri foto sticky/diam, hanya kolom kanan yang bisa di-scroll */}
                        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-6 md:flex-row md:items-stretch md:gap-6 md:overflow-hidden md:p-0 md:pl-6">
                            {/* KOLOM KIRI: Kartu Standee Preview Menu Live (Sticky / Diam) */}
                            <div className="shrink-0 md:max-h-full md:overflow-y-auto md:py-6 md:pr-0.5">
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
                            </div>

                            {/* KOLOM KANAN: Panel Informasi & Form Scrollable */}
                            <div className="min-h-0 min-w-0 flex-1 space-y-4 md:overflow-y-auto md:py-6 md:pr-6">
                                {/* Banner Preview Produk Gelap ala Card QRIS */}
                                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#1A1A1A] p-4 text-white shadow-sm">
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
                                                                    ) || 0),
                                                      )
                                                    : parseFloat(basePrice) ||
                                                          0,
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {/* BAGIAN 1: INFORMASI DASAR */}
                                <div className="space-y-3.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)] sm:p-5">
                                    <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                        <span className="flex items-center gap-1.5">
                                            <Sparkles className="size-3.5 text-[#C52828]" />
                                            Spesifikasi & Informasi Produk
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
                                                    setName(e.target.value)
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
                                                        {categories.map((c) => (
                                                            <SelectItem
                                                                key={c.id}
                                                                value={c.id.toString()}
                                                            >
                                                                {c.name}
                                                            </SelectItem>
                                                        ))}
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
                                                        value={basePrice}
                                                        onChange={(e) =>
                                                            setBasePrice(
                                                                e.target.value,
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
                                                setIsLimitedStock(nextChecked);
                                                if (
                                                    nextChecked &&
                                                    (!stockQuantity ||
                                                        Number(stockQuantity) <
                                                            0)
                                                ) {
                                                    setStockQuantity('10');
                                                }
                                                if (
                                                    nextChecked &&
                                                    (!stockValidDays ||
                                                        Number(stockValidDays) <
                                                            1)
                                                ) {
                                                    setStockValidDays('1');
                                                }
                                            }}
                                            label="Aktifkan Stok Terbatas"
                                            description="Batasi jumlah porsi & wajibkan update stok berkala agar menu selalu akurat."
                                        />

                                        {isLimitedStock && (
                                            <div className="space-y-3 rounded-xl border border-[#F3DEC0] bg-[#FFF8EC] p-3.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <Label
                                                        htmlFor="menu_stock_quantity"
                                                        className="flex items-center gap-1.5 text-xs font-bold text-[#18181B]"
                                                    >
                                                        <Package className="size-3.5 text-[#C52828]" />
                                                        <span>
                                                            Jumlah Stok Tersedia{' '}
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
                                                                    ) || 0) <= 5
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
                                                    value={stockQuantity}
                                                    onChange={(e) =>
                                                        setStockQuantity(
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder="15"
                                                    className="h-10 rounded-xl border-[#E6DFD3] bg-white font-mono text-sm font-bold text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                    required={isLimitedStock}
                                                />

                                                <div className="space-y-2 border-t border-[#F0D9B5] pt-2.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <Label
                                                            htmlFor="menu_stock_valid_days"
                                                            className="flex items-center gap-1.5 text-xs font-bold text-[#18181B]"
                                                        >
                                                            <Clock className="size-3.5 text-[#B45309]" />
                                                            <span>
                                                                Masa Berlaku
                                                                Stok (Hari){' '}
                                                                <span className="text-[#C52828]">
                                                                    *
                                                                </span>
                                                            </span>
                                                        </Label>
                                                        <span className="rounded-md bg-white px-2 py-0.5 text-[10px] font-bold text-[#5B4126] ring-1 ring-[#E6DFD3]">
                                                            {(Number.parseInt(
                                                                stockValidDays ||
                                                                    '1',
                                                                10,
                                                            ) || 1) === 1
                                                                ? 'Update Harian'
                                                                : `Per ${
                                                                      Number.parseInt(
                                                                          stockValidDays ||
                                                                              '1',
                                                                          10,
                                                                      ) || 1
                                                                  } Hari`}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <Input
                                                            id="menu_stock_valid_days"
                                                            type="number"
                                                            min="1"
                                                            max="365"
                                                            step="1"
                                                            value={
                                                                stockValidDays
                                                            }
                                                            onChange={(e) =>
                                                                setStockValidDays(
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            className="h-9 w-24 rounded-xl border-[#E6DFD3] bg-white font-mono text-sm font-bold text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                            required={
                                                                isLimitedStock
                                                            }
                                                        />
                                                        {[
                                                            {
                                                                label: '1 Hari (Harian)',
                                                                val: '1',
                                                            },
                                                            {
                                                                label: '2 Hari',
                                                                val: '2',
                                                            },
                                                            {
                                                                label: '3 Hari',
                                                                val: '3',
                                                            },
                                                            {
                                                                label: '7 Hari',
                                                                val: '7',
                                                            },
                                                            {
                                                                label: '30 Hari',
                                                                val: '30',
                                                            },
                                                        ].map((preset) => (
                                                            <button
                                                                key={preset.val}
                                                                type="button"
                                                                onClick={() =>
                                                                    setStockValidDays(
                                                                        preset.val,
                                                                    )
                                                                }
                                                                className={cn(
                                                                    'h-8 cursor-pointer rounded-lg border px-2.5 text-[11px] font-bold transition',
                                                                    stockValidDays ===
                                                                        preset.val
                                                                        ? 'border-[#C52828] bg-[#C52828] text-white shadow-2xs'
                                                                        : 'border-[#DFCFA9] bg-white text-[#5B4126] hover:bg-[#FAF5E8]',
                                                                )}
                                                            >
                                                                {preset.label}
                                                            </button>
                                                        ))}
                                                    </div>

                                                    {editingMenu?.is_limited_stock && (
                                                        <div className="space-y-2 rounded-lg border border-[#E6DFD3] bg-white p-2.5 text-[11px]">
                                                            <div className="flex flex-wrap items-center justify-between gap-1 text-[#5B4126]">
                                                                <span>
                                                                    Update
                                                                    terakhir:{' '}
                                                                    <strong className="text-[#18181B]">
                                                                        {editingMenu.stock_updated_at_label ||
                                                                            'Belum tercatat'}
                                                                    </strong>
                                                                </span>
                                                                {editingMenu.is_stock_expired ? (
                                                                    <span className="font-bold text-[#B91C1C]">
                                                                        Kedaluwarsa
                                                                        (Habis
                                                                        di meja)
                                                                    </span>
                                                                ) : (
                                                                    <span className="font-bold text-[#15803D]">
                                                                        Berlaku
                                                                        s/d{' '}
                                                                        {
                                                                            editingMenu.stock_valid_until_label
                                                                        }
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-[#18181B]">
                                                                <Checkbox
                                                                    checked={
                                                                        refreshStockTimestamp
                                                                    }
                                                                    onCheckedChange={(
                                                                        checked,
                                                                    ) =>
                                                                        setRefreshStockTimestamp(
                                                                            Boolean(
                                                                                checked,
                                                                            ),
                                                                        )
                                                                    }
                                                                />
                                                                <span>
                                                                    Tandai stok
                                                                    sudah
                                                                    diperbarui
                                                                    hari ini
                                                                    (mulai ulang
                                                                    hitung{' '}
                                                                    {stockValidDays ||
                                                                        1}{' '}
                                                                    hari)
                                                                </span>
                                                            </label>
                                                        </div>
                                                    )}

                                                    <p className="text-[11px] leading-snug text-[#78716C]">
                                                        Disarankan update stok
                                                        setiap hari (1 hari).
                                                        Bila Admin lupa update
                                                        melewati masa berlaku,
                                                        menu otomatis tampil{' '}
                                                        <strong className="text-[#18181B]">
                                                            Habis
                                                        </strong>{' '}
                                                        di pelanggan hingga
                                                        diperbarui lagi.
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* BAGIAN 2: PENGATURAN PROMO & DISKON MENU */}
                                <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)] sm:p-5">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                            <Tag className="size-3.5 text-[#C52828]" />
                                            Promo & Potongan Harga
                                        </span>
                                        <button
                                            id="menu_is_discount_active"
                                            type="button"
                                            role="switch"
                                            aria-checked={isDiscountActive}
                                            onClick={() => {
                                                const nextState =
                                                    !isDiscountActive;
                                                setIsDiscountActive(nextState);
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
                                            Aktifkan sakelar di atas untuk
                                            memberikan diskon persen (%) atau
                                            potongan Rupiah (Rp).
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
                                                                Persen (%)
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
                                                                Nominal (Rp)
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
                                                            onChange={(e) =>
                                                                setDiscountValue(
                                                                    e.target
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
                                                {(discountType === 'percent'
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
                                                const baseNum = Math.max(
                                                    0,
                                                    parseFloat(basePrice) || 0,
                                                );
                                                const discValNum = Math.max(
                                                    0,
                                                    parseFloat(discountValue) ||
                                                        0,
                                                );
                                                const cutAmount =
                                                    discountType === 'percent'
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
                                                const finalNum = Math.max(
                                                    0,
                                                    baseNum - cutAmount,
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
                                                        <span className="rounded-md bg-[#FDECEB] px-2 py-0.5 text-[10px] font-extrabold text-[#C52828]">
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
                                <div className="space-y-3.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)] sm:p-5">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                            <CupSoda className="size-3.5 text-[#C52828]" />
                                            Opsi Ukuran, Ikon Cup & Topping
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={addOptionGroup}
                                            className="h-7 cursor-pointer gap-1 rounded-lg border-[#E6DFD3] bg-[#FAF8F4] px-2.5 text-[11px] font-bold text-[#C52828] hover:bg-[#FDECEB]/50"
                                        >
                                            <Plus className="size-3" /> Tambah
                                            Grup Opsi
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
                                                Tambah Pilihan Ukuran / Topping
                                            </span>
                                            <span className="text-[10px] font-medium text-[#78716C]">
                                                Contoh: Small, Medium, Large
                                                beserta ikon cup.
                                            </span>
                                        </button>
                                    ) : (
                                        optionGroups.map((group, gIdx) => {
                                            const isSizeGroup =
                                                group.selection_type ===
                                                    'single' ||
                                                isSizeGroupName(group.name);
                                            const rawBase = Math.max(
                                                0,
                                                parseFloat(basePrice) || 0,
                                            );
                                            const rawDisc = Math.max(
                                                0,
                                                parseFloat(discountValue) || 0,
                                            );
                                            const numericBase = isDiscountActive
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
                                                            value={group.name}
                                                            onChange={(e) =>
                                                                updateGroupField(
                                                                    gIdx,
                                                                    'name',
                                                                    e.target
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
                                                                icon={Trash2}
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
                                                                Wajib dipilih
                                                                pelanggan
                                                            </span>
                                                        </label>
                                                    </div>

                                                    <div className="@container space-y-2.5 rounded-xl border border-[#E8DFC8] bg-[#FFFDF9] p-3">
                                                        {group.items.map(
                                                            (item, iIdx) => {
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
                                                                        className="flex flex-wrap items-center gap-2 rounded-xl border border-[#EFE6D2] bg-[#FAF7F0] p-2 @[610px]:flex-nowrap"
                                                                    >
                                                                        <div
                                                                            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#E4D9C3] bg-white shadow-2xs"
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
                                                                                className="h-9 min-w-[155px] flex-1 rounded-lg border-[#DFCFA9] bg-white px-2.5 text-xs font-semibold text-[#18181B] @[610px]:w-48 @[610px]:flex-none"
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
                                                                            className="h-9 min-w-[115px] flex-1 rounded-lg border-[#DFCFA9] bg-white px-3 text-xs font-semibold text-[#18181B]"
                                                                            required
                                                                        />

                                                                        <div className="flex w-full items-center justify-end gap-2 @[610px]:w-auto @[610px]:shrink-0">
                                                                            <div className="relative flex-1 @[610px]:flex-none">
                                                                                <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] font-bold text-[#78716C]">
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
                                                                                    className="h-9 w-full rounded-lg border-[#DFCFA9] bg-white pr-2 pl-10 text-xs font-semibold text-[#18181B] @[610px]:w-30"
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
                                                                                    'h-9 shrink-0 cursor-pointer rounded-lg border px-2.5 text-[11px] font-bold transition',
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
                                                                                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                                                                                aria-label="Hapus pilihan"
                                                                            >
                                                                                <X className="size-4" />
                                                                            </button>
                                                                        </div>
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
                                                            className="flex h-9 w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-dashed border-[#DFCFA9] text-xs font-bold text-[#C52828] transition-colors hover:bg-[#FDECEC]/50"
                                                        >
                                                            <Plus className="size-3.5" />{' '}
                                                            Tambah Pilihan
                                                            Ukuran / Opsi
                                                        </button>
                                                    </div>

                                                    {isSizeGroup &&
                                                        group.items.length >
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
                                                                    <span className="inline-flex items-center gap-1 rounded-md bg-[#FDECEB] px-2 py-0.5 text-[9.5px] font-semibold text-[#C52828]">
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
                                        })
                                    )}
                                </div>

                                {/* Frame Tombol Aksi di dalam Area Scroll Kanan */}
                                <div className="flex flex-col-reverse gap-2 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-3.5 shadow-[0_2px_12px_rgba(26,26,26,0.03)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setIsModalOpen(false);
                                            openIconManager(
                                                editingMenu?.id,
                                                true,
                                            );
                                        }}
                                        className="h-10 cursor-pointer justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold text-[#B91C1C] hover:bg-[#FDECEB] hover:text-[#B91C1C]"
                                    >
                                        <CupSoda className="size-3.5" /> Kelola
                                        Ikon Ukuran
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-10 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                        onClick={() => setIsModalOpen(false)}
                                        disabled={isSubmitting}
                                    >
                                        Tutup
                                    </Button>

                                    <Button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="h-10 cursor-pointer gap-2 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
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
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ===================================================================== */}
            {/* MODAL 2: PANEL KHUSUS KELOLA IKON UKURAN PRODUK (Gaya 2 Kolom Standee) */}
            {/* ===================================================================== */}
            <Dialog
                open={isIconManagerOpen}
                onOpenChange={(open) => {
                    if (!open) {
                        closeIconManager();
                    } else {
                        setIsIconManagerOpen(true);
                    }
                }}
            >
                <DialogContent className="flex max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-6xl">
                    <form
                        onSubmit={handleSaveBulkIcons}
                        className="flex max-h-[94dvh] min-h-0 flex-col overflow-hidden"
                    >
                        <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-6 pt-4 pb-3.5">
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

                        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-6 md:flex-row md:items-stretch md:gap-6 md:overflow-hidden md:p-0 md:pl-6">
                            {/* KOLOM KIRI: Kartu Standee Preview Ikon Ukuran (Sticky / Diam) */}
                            <div className="shrink-0 md:max-h-full md:overflow-y-auto md:py-6 md:pr-0.5">
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
                            </div>

                            {/* KOLOM KANAN: Panel Konfigurasi Ikon Scrollable */}
                            <div className="min-h-0 min-w-0 flex-1 space-y-4 md:overflow-y-auto md:py-6 md:pr-6">
                                {/* Banner Filter Produk Gelap ala Card QRIS */}
                                <div className="flex flex-col gap-2.5 rounded-xl bg-[#1A1A1A] p-4 text-white shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black text-white">
                                            CUP
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold tracking-wide text-white uppercase">
                                                SIDE LINE COFFEE • FILTER UKURAN
                                            </p>
                                            <p className="text-[10px] text-white/60">
                                                Sinkron otomatis dengan kartu
                                                pemesanan QR meja
                                            </p>
                                        </div>
                                    </div>
                                    <Select
                                        value={selectedIconMenuId}
                                        onValueChange={setSelectedIconMenuId}
                                    >
                                        <SelectTrigger className="h-9 w-full rounded-xl border-white/15 bg-white/10 text-xs font-semibold text-white sm:w-56">
                                            <SelectValue placeholder="Semua Produk dengan Ukuran" />
                                        </SelectTrigger>
                                        <SelectContent className="border-[#E8E2D9] bg-[#FFFDFB] text-[#1A1A1A]">
                                            <SelectItem value="all">
                                                Semua Produk (
                                                {menusWithOptions.length} Menu)
                                            </SelectItem>
                                            {menusWithOptions.map((m) => (
                                                <SelectItem
                                                    key={m.id}
                                                    value={String(m.id)}
                                                >
                                                    {m.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {displayedIconMenus.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-[#E6DFD3] bg-[#FFFDFB] p-8 text-center">
                                        <p className="text-sm font-bold text-[#1A1A1A]">
                                            Belum ada produk dengan opsi ukuran.
                                        </p>
                                        <p className="mt-1 text-xs text-[#6E6A64]">
                                            Tambahkan grup opsi Ukuran pada menu
                                            terlebih dahulu melalui tombol Edit
                                            pada kartu menu.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3.5">
                                        {displayedIconMenus.map((menu) => {
                                            const numericBase =
                                                parseFloat(menu.base_price) ||
                                                0;

                                            return (
                                                <div
                                                    key={menu.id}
                                                    className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]"
                                                >
                                                    <div className="flex items-center justify-between gap-2 border-b border-[#EFEAE0] pb-2.5">
                                                        <div>
                                                            <h4 className="flex items-center gap-1.5 text-xs font-extrabold text-[#1A1A1A]">
                                                                <Sparkles className="size-3.5 text-[#C52828]" />
                                                                {menu.name}
                                                            </h4>
                                                            <p className="text-[11px] font-semibold text-[#C52828]">
                                                                Harga Dasar:{' '}
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
                                                                setReturnToMenuModalAfterIconManager(
                                                                    false,
                                                                );
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
                                                            Edit Menu
                                                        </Button>
                                                    </div>

                                                    {menu.option_groups?.map(
                                                        (group) => (
                                                            <div
                                                                key={group.id}
                                                                className="space-y-2.5"
                                                            >
                                                                <div className="text-[11px] font-bold tracking-wider text-[#5B4126] uppercase">
                                                                    Grup:{' '}
                                                                    {group.name}
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
                                        })}
                                    </div>
                                )}
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
                                    onClick={closeIconManager}
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

            <Dialog
                open={!!quickStockMenu}
                onOpenChange={(open) => !open && setQuickStockMenu(null)}
            >
                <DialogContent className="w-[calc(100%-1.5rem)] max-w-md overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl">
                    {quickStockMenu && (
                        <form onSubmit={handleQuickStockSubmit}>
                            <div className="border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                                <FormDialogHeader
                                    icon={Package}
                                    badge="Update Stok Menu"
                                    tag={
                                        quickStockMenu.category?.name || 'MENU'
                                    }
                                    statusLabel={
                                        quickStockMenu.is_stock_expired
                                            ? 'Perlu Update'
                                            : `Stok ${quickStockMenu.stock_quantity ?? 0}`
                                    }
                                    statusActive={
                                        !quickStockMenu.is_stock_expired &&
                                        (quickStockMenu.stock_quantity ?? 0) > 0
                                    }
                                    title={quickStockMenu.name}
                                    description="Perbarui stok siap jual & atur masa berlakunya. Status pelanggan langsung aktif kembali."
                                />
                            </div>

                            <div className="space-y-4 bg-[#FFFDFB] p-5">
                                {quickStockMenu.stock_updated_at_label && (
                                    <div className="rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] px-3 py-2 text-[11px] text-[#5B4126]">
                                        Terakhir update:{' '}
                                        <strong className="text-[#18181B]">
                                            {
                                                quickStockMenu.stock_updated_at_label
                                            }
                                        </strong>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label
                                        htmlFor="quick_stock_qty"
                                        className="text-xs font-bold text-[#18181B]"
                                    >
                                        Stok Tersedia (Porsi){' '}
                                        <span className="text-[#C52828]">
                                            *
                                        </span>
                                    </Label>
                                    <Input
                                        id="quick_stock_qty"
                                        type="number"
                                        min="0"
                                        max="100000"
                                        step="1"
                                        value={quickStockQty}
                                        onChange={(e) =>
                                            setQuickStockQty(e.target.value)
                                        }
                                        className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] font-mono text-sm font-bold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                        required
                                    />
                                    <div className="flex flex-wrap gap-1.5">
                                        {[
                                            { label: '0 (Habis)', val: 0 },
                                            { label: '+5', delta: 5 },
                                            { label: '+10', delta: 10 },
                                            { label: '+20', delta: 20 },
                                        ].map((preset) => (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => {
                                                    if (
                                                        preset.val !== undefined
                                                    ) {
                                                        setQuickStockQty(
                                                            String(preset.val),
                                                        );
                                                    } else {
                                                        const cur =
                                                            Number.parseInt(
                                                                quickStockQty ||
                                                                    '0',
                                                                10,
                                                            ) || 0;
                                                        setQuickStockQty(
                                                            String(
                                                                cur +
                                                                    (preset.delta ??
                                                                        0),
                                                            ),
                                                        );
                                                    }
                                                }}
                                                className="h-7 cursor-pointer rounded-lg border border-[#DFCFA9] bg-white px-2.5 text-[11px] font-bold text-[#5B4126] transition hover:bg-[#FAF5E8]"
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label
                                        htmlFor="quick_stock_valid_days"
                                        className="text-xs font-bold text-[#18181B]"
                                    >
                                        Masa Berlaku Stok (Hari){' '}
                                        <span className="text-[#C52828]">
                                            *
                                        </span>
                                    </Label>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Input
                                            id="quick_stock_valid_days"
                                            type="number"
                                            min="1"
                                            max="365"
                                            step="1"
                                            value={quickStockValidDays}
                                            onChange={(e) =>
                                                setQuickStockValidDays(
                                                    e.target.value,
                                                )
                                            }
                                            className="h-9 w-24 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] font-mono text-sm font-bold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                            required
                                        />
                                        {[
                                            { label: '1 Hr', val: '1' },
                                            { label: '2 Hr', val: '2' },
                                            { label: '3 Hr', val: '3' },
                                            { label: '7 Hr', val: '7' },
                                            { label: '30 Hr', val: '30' },
                                        ].map((preset) => (
                                            <button
                                                key={preset.val}
                                                type="button"
                                                onClick={() =>
                                                    setQuickStockValidDays(
                                                        preset.val,
                                                    )
                                                }
                                                className={cn(
                                                    'h-8 cursor-pointer rounded-lg border px-2.5 text-[11px] font-bold transition',
                                                    quickStockValidDays ===
                                                        preset.val
                                                        ? 'border-[#C52828] bg-[#C52828] text-white'
                                                        : 'border-[#DFCFA9] bg-white text-[#5B4126] hover:bg-[#FAF5E8]',
                                                )}
                                            >
                                                {preset.label}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[11px] leading-snug text-[#78716C]">
                                        Stok akan otomatis ditandai{' '}
                                        <strong className="text-[#18181B]">
                                            Habis
                                        </strong>{' '}
                                        di pelanggan setelah{' '}
                                        {quickStockValidDays || 1} hari kalender
                                        jika belum diperbarui kembali.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 border-t border-[#EBE5DC] bg-[#FAF8F4] px-5 py-3.5">
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setQuickStockMenu(null)}
                                    disabled={isUpdatingQuickStock}
                                    className="h-10 cursor-pointer rounded-xl border-[#E6DFD3] bg-white px-4 text-xs font-bold text-[#18181B] hover:bg-[#FAF5E8]"
                                >
                                    Batal
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isUpdatingQuickStock}
                                    className="h-10 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-4 text-xs font-bold text-white shadow-sm hover:bg-[#A81E1E]"
                                >
                                    <RefreshCw
                                        className={cn(
                                            'size-3.5',
                                            isUpdatingQuickStock &&
                                                'animate-spin',
                                        )}
                                    />
                                    {isUpdatingQuickStock
                                        ? 'Menyimpan...'
                                        : 'Simpan Update Stok'}
                                </Button>
                            </div>
                        </form>
                    )}
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
            title: 'Ringkasan',
            href: '/dashboard',
        },
        {
            title: 'Menu & Kategori',
            href: '/admin/menus',
        },
    ],
};
