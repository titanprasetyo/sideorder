import { Head, router } from '@inertiajs/react';
import {
    CheckCircle2,
    Coffee,
    ImagePlus,
    Image as ImageIcon,
    Layers,
    ListChecks,
    Pencil,
    Plus,
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
    StatCard,
    StatGrid,
    StatusPill,
    ToggleField,
} from '@/components/admin/admin-ui';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface OptionItem {
    id?: number;
    name: string;
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
    is_active: boolean;
    category?: { id: number; name: string };
    option_groups?: {
        id: number;
        name: string;
        selection_type: 'single' | 'multiple';
        is_required: boolean;
        option_items: {
            id: number;
            name: string;
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

function SectionTitle({ step, title, action }: { step: number; title: string; action?: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-extrabold text-primary-foreground">
                    {step}
                </span>
                <h4 className="text-sm font-extrabold text-foreground">{title}</h4>
            </div>
            {action}
        </div>
    );
}

export default function MenusIndex({ menus, categories }: Props) {
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
    const [deletingMenu, setDeletingMenu] = useState<Menu | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Form state dasar
    const [categoryId, setCategoryId] = useState<string>('');
    const [name, setName] = useState('');
    const [slug, setSlug] = useState('');
    const [description, setDescription] = useState('');
    const [basePrice, setBasePrice] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    // Form state grup kustomisasi (Ukuran & Topping)
    const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const formatRupiah = (amount: number | string) => {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
        }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
    };

    const availableCount = menus.filter((m) => m.is_active).length;

    const resetForm = () => {
        setCategoryId(categories[0]?.id.toString() || '');
        setName('');
        setSlug('');
        setDescription('');
        setBasePrice('');
        setIsActive(true);
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
        setIsActive(menu.is_active);
        setImageFile(null);
        setImagePreview(menu.image_path ? `/storage/${menu.image_path}` : null);

        // Petakan option groups yang ada
        if (menu.option_groups) {
            setOptionGroups(
                menu.option_groups.map((g) => ({
                    id: g.id,
                    name: g.name,
                    selection_type: g.selection_type,
                    is_required: g.is_required,
                    min_selection: g.is_required ? 1 : 0,
                    max_selection: g.selection_type === 'single' ? 1 : null,
                    items: g.option_items.map((i) => ({
                        id: i.id,
                        name: i.name,
                        additional_price: parseFloat(i.additional_price),
                        is_default: i.is_default,
                        is_active: i.is_active,
                    })),
                }))
            );
        } else {
            setOptionGroups([]);
        }

        setIsModalOpen(true);
    };

    // Handler Grup Opsi
    const addOptionGroup = () => {
        setOptionGroups([
            ...optionGroups,
            {
                name: '',
                selection_type: 'single',
                is_required: true,
                min_selection: 1,
                max_selection: 1,
                items: [
                    { name: 'Regular', additional_price: 0, is_default: true, is_active: true },
                    { name: 'Large', additional_price: 4000, is_default: false, is_active: true },
                ],
            },
        ]);
    };

    const removeOptionGroup = (groupIndex: number) => {
        setOptionGroups(optionGroups.filter((_, i) => i !== groupIndex));
    };

    const updateGroupField = (groupIndex: number, field: keyof OptionGroup, value: any) => {
        const updated = [...optionGroups];
        updated[groupIndex] = { ...updated[groupIndex], [field]: value };
        setOptionGroups(updated);
    };

    const addOptionItem = (groupIndex: number) => {
        const updated = [...optionGroups];
        updated[groupIndex].items.push({
            name: '',
            additional_price: 0,
            is_default: false,
            is_active: true,
        });
        setOptionGroups(updated);
    };

    const removeOptionItem = (groupIndex: number, itemIndex: number) => {
        const updated = [...optionGroups];
        updated[groupIndex].items = updated[groupIndex].items.filter((_, i) => i !== itemIndex);
        setOptionGroups(updated);
    };

    const updateItemField = (groupIndex: number, itemIndex: number, field: keyof OptionItem, value: any) => {
        const updated = [...optionGroups];
        updated[groupIndex].items[itemIndex] = {
            ...updated[groupIndex].items[itemIndex],
            [field]: value,
        };
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
        formData.append('is_active', isActive ? '1' : '0');
        if (imageFile) formData.append('image', imageFile);

        // Serialisasi grup opsi
        optionGroups.forEach((group, gIdx) => {
            formData.append(`option_groups[${gIdx}][name]`, group.name);
            formData.append(`option_groups[${gIdx}][selection_type]`, group.selection_type);
            formData.append(`option_groups[${gIdx}][is_required]`, group.is_required ? '1' : '0');
            formData.append(`option_groups[${gIdx}][min_selection]`, group.is_required ? '1' : '0');
            if (group.max_selection) {
                formData.append(`option_groups[${gIdx}][max_selection]`, group.max_selection.toString());
            }

            group.items.forEach((item, iIdx) => {
                formData.append(`option_groups[${gIdx}][items][${iIdx}][name]`, item.name);
                formData.append(`option_groups[${gIdx}][items][${iIdx}][additional_price]`, item.additional_price.toString());
                formData.append(`option_groups[${gIdx}][items][${iIdx}][is_default]`, item.is_default ? '1' : '0');
                formData.append(`option_groups[${gIdx}][items][${iIdx}][is_active]`, item.is_active ? '1' : '0');
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
                    toast.error(Object.values(errors)[0] || 'Terjadi kesalahan saat menyimpan.');
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
                    toast.error(Object.values(errors)[0] || 'Terjadi kesalahan saat menyimpan.');
                },
            });
        }
    };

    const confirmDelete = () => {
        if (!deletingMenu) return;

        setIsDeleting(true);
        router.delete(`/admin/menus/${deletingMenu.id}`, {
            onSuccess: () => toast.success('Menu berhasil dihapus!'),
            onError: (err) => toast.error(Object.values(err)[0] || 'Gagal menghapus menu.'),
            onFinish: () => {
                setIsDeleting(false);
                setDeletingMenu(null);
            },
        });
    };

    const filteredMenus = useMemo(() => {
        const q = search.toLowerCase().trim();

        return menus.filter((m) => {
            const matchCategory = selectedCategory === 'all' || m.category_id === selectedCategory;
            const matchSearch = !q || m.name.toLowerCase().includes(q) || (m.description ?? '').toLowerCase().includes(q);

            return matchCategory && matchSearch;
        });
    }, [menus, selectedCategory, search]);

    return (
        <>
            <Head title="Manajemen Menu Kafe" />

            <AdminPage>
                <PageHeader
                    icon={Coffee}
                    title="Menu & Produk"
                    description="Kelola produk, harga, foto, serta opsi ukuran dan topping."
                    actions={
                        <Button onClick={openCreateModal} className="h-10 gap-2 rounded-xl px-4 font-bold shadow-sm">
                            <Plus className="size-4" />
                            Tambah Menu
                        </Button>
                    }
                />

                <StatGrid>
                    <StatCard icon={Coffee} tone="brand" label="Total Menu" value={menus.length} />
                    <StatCard icon={CheckCircle2} tone="success" label="Tersedia" value={availableCount} hint="Bisa dipesan" />
                    <StatCard icon={XCircle} tone="warning" label="Habis / Nonaktif" value={menus.length - availableCount} hint="Tidak tampil di pelanggan" />
                    <StatCard icon={Layers} tone="neutral" label="Kategori" value={categories.length} />
                </StatGrid>

                {/* Toolbar */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <FilterTabs<number | 'all'>
                        value={selectedCategory}
                        onChange={setSelectedCategory}
                        options={[
                            { value: 'all', label: 'Semua', count: menus.length },
                            ...categories.map((cat) => ({
                                value: cat.id,
                                label: cat.name,
                                count: menus.filter((m) => m.category_id === cat.id).length,
                            })),
                        ]}
                    />
                    <SearchInput value={search} onChange={setSearch} placeholder="Cari nama menu..." />
                </div>

                {/* Katalog Card Grid */}
                {filteredMenus.length === 0 ? (
                    <Panel>
                        <EmptyState
                            icon={Coffee}
                            title={menus.length === 0 ? 'Belum ada menu' : 'Menu tidak ditemukan'}
                            description={
                                menus.length === 0
                                    ? 'Tambahkan menu pertama lengkap dengan foto dan harga.'
                                    : 'Tidak ada menu yang cocok dengan filter atau pencarian.'
                            }
                            action={
                                <Button onClick={openCreateModal} className="gap-2 rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E]">
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
                                                !menu.is_active && 'grayscale-[60%]',
                                            )}
                                        />
                                    ) : (
                                        <div className="flex size-full flex-col items-center justify-center gap-1 text-[#B8A67E]">
                                            <ImageIcon className="size-8 stroke-[1.5]" />
                                            <span className="text-[11px] font-semibold">Belum ada foto</span>
                                        </div>
                                    )}
                                    <div className="absolute top-3 left-3">
                                        <span className="rounded-full border border-[#E8DFC8] bg-white/95 px-2.5 py-1 text-[11px] font-bold text-[#18181B] shadow-xs backdrop-blur">
                                            {menu.category?.name || 'Tanpa Kategori'}
                                        </span>
                                    </div>
                                    <div className="absolute top-3 right-3">
                                        {menu.is_active ? (
                                            <StatusPill tone="success" dot className="bg-[#DCFCE7]/95 shadow-xs">
                                                Tersedia
                                            </StatusPill>
                                        ) : (
                                            <StatusPill tone="danger" dot className="bg-[#FEE2E2]/95 shadow-xs">
                                                Habis
                                            </StatusPill>
                                        )}
                                    </div>
                                </div>

                                {/* Detail */}
                                <div className="flex flex-1 flex-col gap-2 p-4">
                                    <h3 className="line-clamp-1 text-base font-extrabold text-[#18181B]">{menu.name}</h3>
                                    <p className="line-clamp-2 min-h-8 text-xs leading-relaxed text-[#78716C]">
                                        {menu.description || 'Belum ada deskripsi.'}
                                    </p>

                                    {menu.option_groups && menu.option_groups.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5">
                                            {menu.option_groups.map((g) => (
                                                <span
                                                    key={g.id}
                                                    className="inline-flex items-center gap-1 rounded-md border border-[#DFCFA9] bg-[#FAF5E8] px-2 py-0.5 text-[10px] font-bold text-[#5B4126]"
                                                >
                                                    <ListChecks className="size-3" />
                                                    {g.name} · {g.option_items.length}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Harga & Aksi */}
                                <div className="flex items-center justify-between gap-2 border-t border-[#E8DFC8] bg-[#FAF6EC] px-4 py-3">
                                    <div>
                                        <p className="text-[10px] font-bold tracking-wide text-[#78716C] uppercase">Harga</p>
                                        <p className="text-base font-black text-[#C52828]">{formatRupiah(menu.base_price)}</p>
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
                                        <IconAction icon={Trash2} label="Hapus menu" variant="danger" onClick={() => setDeletingMenu(menu)} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </AdminPage>

            {/* Modal Tambah / Edit Menu */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] p-0 sm:max-w-2xl">
                    <form onSubmit={handleSubmit} className="flex max-h-[92vh] flex-col">
                        <div className="border-b border-[#E8DFC8] bg-[#FAF5E8] px-6 py-5">
                            <FormDialogHeader
                                icon={editingMenu ? Pencil : Coffee}
                                title={editingMenu ? 'Edit Menu' : 'Tambah Menu Baru'}
                                description="Atur informasi produk, harga, foto, serta variasi ukuran & topping."
                            />
                        </div>

                        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-5">
                            {/* BAGIAN 1: INFORMASI DASAR */}
                            <section className="space-y-4">
                                <SectionTitle step={1} title="Informasi Produk" />

                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_1fr]">
                                    {/* Upload Foto */}
                                    <label
                                        htmlFor="image"
                                        className="group relative flex aspect-square cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[#DFCFA9] bg-[#FAF5E8] text-center transition-colors hover:border-[#C52828]/50 hover:bg-[#FDECEC]/40"
                                    >
                                        {imagePreview ? (
                                            <>
                                                <img src={imagePreview} alt="Preview" className="size-full object-cover" />
                                                <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100">
                                                    <Upload className="mr-1.5 size-4" /> Ganti Foto
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex flex-col items-center gap-1.5 px-3 text-[#78716C]">
                                                <ImagePlus className="size-7 text-[#B8A67E]" />
                                                <span className="text-xs font-bold text-[#18181B]">Unggah Foto</span>
                                                <span className="text-[10px]">JPG / PNG, rasio 4:3</span>
                                            </div>
                                        )}
                                        <input id="image" type="file" accept="image/*" onChange={handleImageChange} className="sr-only" />
                                    </label>

                                    <div className="grid content-start gap-4">
                                        <div className="grid gap-1.5">
                                            <Label htmlFor="name" className="text-xs font-bold text-[#18181B]">
                                                Nama Menu <span className="text-[#C52828]">*</span>
                                            </Label>
                                            <Input
                                                id="name"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="Contoh: Kopi Susu Gula Aren"
                                                className="h-10 rounded-xl border-[#DFCFA9] bg-white text-sm font-medium text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                required
                                            />
                                        </div>

                                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                            <div className="grid gap-1.5">
                                                <Label htmlFor="category" className="text-xs font-bold text-[#18181B]">
                                                    Kategori <span className="text-[#C52828]">*</span>
                                                </Label>
                                                <Select value={categoryId} onValueChange={setCategoryId} required>
                                                    <SelectTrigger id="category" className="h-10 w-full rounded-xl border-[#DFCFA9] bg-white text-sm font-medium text-[#18181B]">
                                                        <SelectValue placeholder="Pilih Kategori" />
                                                    </SelectTrigger>
                                                    <SelectContent className="border-[#E8DFC8] bg-[#FFFDF9] text-[#18181B]">
                                                        {categories.map((c) => (
                                                            <SelectItem key={c.id} value={c.id.toString()}>
                                                                {c.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="grid gap-1.5">
                                                <Label htmlFor="price" className="text-xs font-bold text-[#18181B]">
                                                    Harga Dasar <span className="text-[#C52828]">*</span>
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
                                                        onChange={(e) => setBasePrice(e.target.value)}
                                                        placeholder="18000"
                                                        className="h-10 rounded-xl border-[#DFCFA9] bg-white pl-9 text-sm font-medium text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid gap-1.5">
                                    <Label htmlFor="description" className="text-xs font-bold text-[#18181B]">Deskripsi Singkat</Label>
                                    <textarea
                                        id="description"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        rows={2}
                                        placeholder="Espresso dengan susu segar dan sirup aren alami..."
                                        className="w-full resize-none rounded-xl border border-[#DFCFA9] bg-white px-3 py-2 text-sm text-[#18181B] shadow-xs outline-none placeholder:text-[#A8A29E] focus-visible:border-[#C52828] focus-visible:ring-[3px] focus-visible:ring-[#C52828]/20"
                                    />
                                </div>

                                <ToggleField
                                    id="menu_is_active"
                                    checked={isActive}
                                    onChange={setIsActive}
                                    label="Tersedia untuk dipesan"
                                    description="Matikan jika stok habis agar tidak bisa dipesan pelanggan."
                                />
                            </section>

                            {/* BAGIAN 2: KUSTOMISASI (UKURAN & TOPPING) */}
                            <section className="space-y-3">
                                <SectionTitle
                                    step={2}
                                    title="Opsi Ukuran & Topping"
                                    action={
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={addOptionGroup}
                                            className="h-8 gap-1 rounded-lg border-[#DFCFA9] bg-white text-xs font-bold text-[#18181B] hover:bg-[#FAF5E8]"
                                        >
                                            <Plus className="size-3.5" /> Tambah Grup
                                        </Button>
                                    }
                                />

                                {optionGroups.length === 0 ? (
                                    <button
                                        type="button"
                                        onClick={addOptionGroup}
                                        className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-[#DFCFA9] bg-[#FAF5E8]/60 px-4 py-6 text-center transition-colors hover:border-[#C52828]/50 hover:bg-[#FAF5E8]"
                                    >
                                        <ListChecks className="size-5 text-[#B8A67E]" />
                                        <span className="text-xs font-bold text-[#18181B]">Belum ada grup opsi</span>
                                        <span className="text-[11px] font-medium text-[#78716C]">
                                            Klik untuk menambah pilihan seperti Ukuran, Level Es, atau Topping.
                                        </span>
                                    </button>
                                ) : (
                                    optionGroups.map((group, gIdx) => (
                                        <div key={gIdx} className="space-y-3 rounded-xl border border-[#E8DFC8] bg-[#FAF5E8] p-4">
                                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                                <Input
                                                    value={group.name}
                                                    onChange={(e) => updateGroupField(gIdx, 'name', e.target.value)}
                                                    placeholder="Nama grup (misal: Ukuran, Topping)"
                                                    className="h-9 flex-1 rounded-lg border-[#DFCFA9] bg-white text-sm font-bold text-[#18181B]"
                                                    required
                                                />
                                                <div className="flex items-center gap-2">
                                                    <Select
                                                        value={group.selection_type}
                                                        onValueChange={(val) => updateGroupField(gIdx, 'selection_type', val)}
                                                    >
                                                        <SelectTrigger className="h-9 w-full rounded-lg border-[#DFCFA9] bg-white text-xs font-semibold sm:w-40">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent className="border-[#E8DFC8] bg-[#FFFDF9] text-[#18181B]">
                                                            <SelectItem value="single">Pilih salah satu</SelectItem>
                                                            <SelectItem value="multiple">Boleh pilih banyak</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <IconAction
                                                        icon={Trash2}
                                                        label="Hapus grup"
                                                        variant="danger"
                                                        onClick={() => removeOptionGroup(gIdx)}
                                                    />
                                                </div>
                                            </div>

                                            <label htmlFor={`req_${gIdx}`} className="flex w-fit cursor-pointer items-center gap-2">
                                                <Checkbox
                                                    id={`req_${gIdx}`}
                                                    checked={group.is_required}
                                                    onCheckedChange={(checked) => updateGroupField(gIdx, 'is_required', Boolean(checked))}
                                                />
                                                <span className="text-xs font-bold text-[#18181B]">Wajib dipilih pelanggan</span>
                                            </label>

                                            {/* Daftar Opsi di dalam Grup */}
                                            <div className="space-y-2 rounded-lg border border-[#E8DFC8] bg-[#FFFDF9] p-2.5">
                                                {group.items.map((item, iIdx) => (
                                                    <div key={iIdx} className="flex items-center gap-2">
                                                        <Input
                                                            value={item.name}
                                                            onChange={(e) => updateItemField(gIdx, iIdx, 'name', e.target.value)}
                                                            placeholder="Nama pilihan (Regular, Large...)"
                                                            className="h-8 flex-1 rounded-lg border-[#DFCFA9] bg-white text-xs text-[#18181B]"
                                                            required
                                                        />
                                                        <div className="relative">
                                                            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] font-bold text-[#78716C]">
                                                                +Rp
                                                            </span>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                step="500"
                                                                value={item.additional_price}
                                                                onChange={(e) =>
                                                                    updateItemField(gIdx, iIdx, 'additional_price', parseFloat(e.target.value) || 0)
                                                                }
                                                                className="h-8 w-28 rounded-lg border-[#DFCFA9] bg-white pl-10 text-xs text-[#18181B]"
                                                            />
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeOptionItem(gIdx, iIdx)}
                                                            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#78716C] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                                                            aria-label="Hapus pilihan"
                                                        >
                                                            <X className="size-3.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => addOptionItem(gIdx)}
                                                    className="flex h-8 w-full items-center justify-center gap-1 rounded-lg border border-dashed border-[#DFCFA9] text-[11px] font-bold text-[#C52828] transition-colors hover:bg-[#FDECEC]/50"
                                                >
                                                    <Plus className="size-3.5" /> Tambah Pilihan
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </section>
                        </div>

                        <DialogFooter className="gap-2 border-t border-[#E8DFC8] bg-[#FAF5E8] px-6 py-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-xl border-[#DFCFA9] bg-white font-semibold text-[#18181B] hover:bg-[#FAF5E8]"
                                onClick={() => setIsModalOpen(false)}
                                disabled={isSubmitting}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="rounded-xl bg-[#C52828] font-bold text-white shadow-sm hover:bg-[#A81E1E]"
                            >
                                {isSubmitting ? 'Menyimpan...' : editingMenu ? 'Simpan Perubahan' : 'Tambah Menu'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deletingMenu}
                onOpenChange={(open) => !open && setDeletingMenu(null)}
                title="Hapus menu?"
                description={
                    <>
                        Menu <b className="font-extrabold text-[#18181B]">{deletingMenu?.name}</b> akan dihapus permanen dari katalog.
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
