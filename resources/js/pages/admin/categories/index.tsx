import { Head, router, useForm } from '@inertiajs/react';
import {
    Check,
    CheckCircle2,
    Coffee,
    EyeOff,
    Hash,
    Layers,
    Link2,
    Pencil,
    Plus,
    Sparkles,
    Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    AdminPage,
    ConfirmDialog,
    EmptyState,
    FieldError,
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
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Category {
    id: number;
    name: string;
    slug: string;
    sort_order: number;
    is_active: boolean;
    menus_count?: number;
    created_at: string;
    updated_at: string;
}

interface Props {
    categories: Category[];
}

export default function CategoriesIndex({ categories }: Props) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(
        null,
    );
    const [deletingCategory, setDeletingCategory] = useState<Category | null>(
        null,
    );
    const [isDeleting, setIsDeleting] = useState(false);
    const [search, setSearch] = useState('');

    const form = useForm({
        name: '',
        slug: '',
        sort_order: 0,
        is_active: true,
    });

    const activeCount = categories.filter((c) => c.is_active).length;
    const totalMenus = categories.reduce(
        (sum, c) => sum + (c.menus_count ?? 0),
        0,
    );

    const filteredCategories = useMemo(() => {
        const q = search.toLowerCase().trim();
        if (!q) return categories;

        return categories.filter(
            (c) =>
                c.name.toLowerCase().includes(q) ||
                c.slug.toLowerCase().includes(q),
        );
    }, [categories, search]);

    const openCreateModal = () => {
        setEditingCategory(null);
        form.setData({
            name: '',
            slug: '',
            sort_order: categories.length + 1,
            is_active: true,
        });
        form.clearErrors();
        setIsModalOpen(true);
    };

    const openEditModal = (category: Category) => {
        setEditingCategory(category);
        form.setData({
            name: category.name,
            slug: category.slug,
            sort_order: category.sort_order,
            is_active: category.is_active,
        });
        form.clearErrors();
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingCategory) {
            form.put(`/admin/categories/${editingCategory.id}`, {
                onSuccess: () => {
                    setIsModalOpen(false);
                    toast.success('Kategori berhasil diperbarui!');
                },
            });
        } else {
            form.post('/admin/categories', {
                onSuccess: () => {
                    setIsModalOpen(false);
                    form.reset();
                    toast.success('Kategori baru berhasil ditambahkan!');
                },
            });
        }
    };

    const confirmDelete = () => {
        if (!deletingCategory) return;

        setIsDeleting(true);
        router.delete(`/admin/categories/${deletingCategory.id}`, {
            onSuccess: () => toast.success('Kategori berhasil dihapus!'),
            onError: (err) =>
                toast.error(
                    Object.values(err)[0] || 'Gagal menghapus kategori.',
                ),
            onFinish: () => {
                setIsDeleting(false);
                setDeletingCategory(null);
            },
        });
    };

    return (
        <>
            <Head title="Manajemen Kategori Menu" />

            <AdminPage>
                <PageHeader
                    icon={Layers}
                    title="Kategori Menu"
                    description="Kelompokkan menu minuman & makanan agar mudah ditemukan pelanggan."
                    actions={
                        <Button
                            onClick={openCreateModal}
                            className="h-9 shrink-0 gap-1.5 rounded-xl bg-[#C52828] px-3.5 text-xs font-bold whitespace-nowrap text-white shadow-sm hover:bg-[#A81E1E]"
                        >
                            <Plus className="size-3.5" />
                            Tambah Kategori
                        </Button>
                    }
                />

                <StatGrid>
                    <StatCard
                        icon={Layers}
                        tone="neutral"
                        label="Total Kategori"
                        value={categories.length}
                    />
                    <StatCard
                        icon={CheckCircle2}
                        tone="success"
                        label="Ditampilkan"
                        value={activeCount}
                        hint="Terlihat oleh pelanggan"
                    />
                    <StatCard
                        icon={EyeOff}
                        tone="warning"
                        label="Disembunyikan"
                        value={categories.length - activeCount}
                        hint="Tidak tampil di menu"
                    />
                    <StatCard
                        icon={Coffee}
                        tone="brand"
                        label="Total Menu"
                        value={totalMenus}
                        hint="Di semua kategori"
                    />
                </StatGrid>

                <Panel>
                    <div className="flex flex-col gap-3 border-b border-[#E8DFC8] bg-[#FAF5E8] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-sm font-extrabold text-[#18181B]">
                                Daftar Kategori
                            </h2>
                            <p className="text-xs font-medium text-[#78716C]">
                                Diurutkan berdasarkan urutan tampil di halaman
                                pelanggan.
                            </p>
                        </div>
                        <SearchInput
                            value={search}
                            onChange={setSearch}
                            placeholder="Cari kategori..."
                        />
                    </div>

                    {filteredCategories.length === 0 ? (
                        <EmptyState
                            icon={Layers}
                            title={
                                categories.length === 0
                                    ? 'Belum ada kategori'
                                    : 'Kategori tidak ditemukan'
                            }
                            description={
                                categories.length === 0
                                    ? 'Buat kategori seperti Coffee, Non-Coffee, atau Makanan untuk mulai menyusun menu.'
                                    : 'Coba gunakan kata kunci lain.'
                            }
                            action={
                                categories.length === 0 && (
                                    <Button
                                        onClick={openCreateModal}
                                        className="gap-2 rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E]"
                                    >
                                        <Plus className="size-4" /> Tambah
                                        Kategori
                                    </Button>
                                )
                            }
                        />
                    ) : (
                        <ul className="divide-y divide-[#E8DFC8] bg-[#FFFDF9]">
                            {filteredCategories.map((cat, index) => (
                                <li
                                    key={cat.id}
                                    className={`flex flex-col gap-3 px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-4 sm:px-5 ${
                                        index % 2 === 0
                                            ? 'bg-[#FFFDF9] hover:bg-[#F5EEDC]/60'
                                            : 'bg-[#FAF6EC]/50 hover:bg-[#F5EEDC]/75'
                                    }`}
                                >
                                    <div className="flex min-w-0 flex-1 items-center gap-3.5">
                                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[#DFCFA9] bg-[#F5EEDC] text-sm font-black text-[#5B4126] shadow-2xs">
                                            {cat.sort_order}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-base font-extrabold text-[#18181B]">
                                                {cat.name}
                                            </p>
                                            <p className="flex items-center gap-1 truncate text-xs font-medium text-[#78716C]">
                                                <Link2 className="size-3 shrink-0 text-[#A8A29E]" />
                                                /{cat.slug}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 pl-[3.375rem] sm:justify-end sm:pl-0">
                                        <div className="flex items-center gap-2">
                                            <StatusPill
                                                tone="neutral"
                                                icon={Coffee}
                                            >
                                                {cat.menus_count ?? 0} Menu
                                            </StatusPill>
                                            {cat.is_active ? (
                                                <StatusPill tone="success" dot>
                                                    Ditampilkan
                                                </StatusPill>
                                            ) : (
                                                <StatusPill tone="warning" dot>
                                                    Disembunyikan
                                                </StatusPill>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1 sm:ml-2">
                                            <IconAction
                                                icon={Pencil}
                                                label="Edit kategori"
                                                onClick={() =>
                                                    openEditModal(cat)
                                                }
                                            />
                                            <IconAction
                                                icon={Trash2}
                                                label="Hapus kategori"
                                                variant="danger"
                                                onClick={() =>
                                                    setDeletingCategory(cat)
                                                }
                                            />
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </AdminPage>

            {/* Modal Tambah / Edit Kategori (Gaya 2 Kolom Standee QR Meja) */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    <form
                        onSubmit={handleSubmit}
                        className="flex max-h-[92dvh] flex-col"
                    >
                        {/* Sticky Header */}
                        <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                            <FormDialogHeader
                                icon={editingCategory ? Pencil : Layers}
                                badge="Katalog Kategori QR"
                                tag={
                                    editingCategory
                                        ? `URUTAN #${form.data.sort_order || 0}`
                                        : 'KATEGORI BARU'
                                }
                                statusLabel={
                                    form.data.is_active ? 'Aktif' : 'Nonaktif'
                                }
                                statusActive={form.data.is_active}
                                title={
                                    editingCategory
                                        ? `Edit Kategori: ${editingCategory.name}`
                                        : 'Tambah Kategori Baru'
                                }
                                description={
                                    editingCategory
                                        ? 'Perbarui detail kategori menu yang tampil di halaman pemesanan meja pelanggan.'
                                        : 'Kelompokkan produk makanan & minuman agar mudah dipilih pelanggan dari meja.'
                                }
                            />
                        </div>

                        {/* Body 2 Kolom ala Modal QR Code Meja */}
                        <div className="flex-1 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5">
                            <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                {/* KOLOM KIRI: Kartu Standee Preview Kategori */}
                                <StandeeModalCard
                                    pillPrimary={`URUTAN #${form.data.sort_order || 0}`}
                                    pillSecondary={
                                        form.data.is_active
                                            ? 'Tampil'
                                            : 'Sembunyi'
                                    }
                                    topBadgeIcon={Layers}
                                    topBadgeLabel="TAB KATEGORI"
                                    heading={
                                        form.data.name || 'Nama Kategori Menu'
                                    }
                                    subheading={`/${form.data.slug || (form.data.name ? form.data.name.toLowerCase().replace(/\s+/g, '-') : 'slug-otomatis')}`}
                                    steps={[
                                        {
                                            num: '01',
                                            label: `Urutan #${form.data.sort_order || 0}`,
                                        },
                                        {
                                            num: '02',
                                            label: form.data.is_active
                                                ? 'Tampil'
                                                : 'Nonaktif',
                                        },
                                        {
                                            num: '03',
                                            label: `${editingCategory?.menus_count ?? 0} Produk`,
                                        },
                                    ]}
                                >
                                    <div className="flex size-36 flex-col items-center justify-center gap-2 bg-[#FAF5E8] p-3 text-center">
                                        <div className="flex size-14 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-sm">
                                            <Layers className="size-7" />
                                        </div>
                                        <span className="max-w-full truncate rounded-md border border-[#E8DFC8] bg-white px-3 py-1 text-[11px] font-extrabold text-[#18181B] shadow-2xs">
                                            {form.data.name || 'Kategori Baru'}
                                        </span>
                                    </div>
                                </StandeeModalCard>

                                {/* KOLOM KANAN: Panel Informasi & Form ala Card QRIS */}
                                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                    <div className="space-y-3.5">
                                        {/* Banner Gelap ala Card QRIS */}
                                        <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                    #{form.data.sort_order || 0}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold tracking-wide text-white uppercase">
                                                        SIDE LINE COFFEE •{' '}
                                                        {form.data.name ||
                                                            'KATEGORI BARU'}
                                                    </p>
                                                    <p className="truncate font-mono text-[10px] text-white/60">
                                                        /
                                                        {form.data.slug ||
                                                            (form.data.name
                                                                ? form.data.name
                                                                      .toLowerCase()
                                                                      .replace(
                                                                          /\s+/g,
                                                                          '-',
                                                                      )
                                                                : 'slug-otomatis')}{' '}
                                                        •{' '}
                                                        {form.data.is_active
                                                            ? 'Aktif di Meja'
                                                            : 'Disembunyikan'}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[10px] font-medium text-white/60">
                                                    Total Menu
                                                </p>
                                                <p className="text-sm font-black text-white tabular-nums">
                                                    {editingCategory?.menus_count ??
                                                        0}{' '}
                                                    Item
                                                </p>
                                            </div>
                                        </div>

                                        {/* Kotak Form Utama */}
                                        <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <Sparkles className="size-3.5 text-[#C52828]" />
                                                    Identitas & Urutan Kategori
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    Tab Katalog QR
                                                </span>
                                            </div>

                                            <div className="grid gap-3">
                                                <div className="grid gap-1.5">
                                                    <Label
                                                        htmlFor="name"
                                                        className="text-xs font-bold text-[#1A1A1A]"
                                                    >
                                                        Nama Kategori{' '}
                                                        <span className="text-[#C52828]">
                                                            *
                                                        </span>
                                                    </Label>
                                                    <Input
                                                        id="name"
                                                        value={form.data.name}
                                                        onChange={(e) =>
                                                            form.setData(
                                                                'name',
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder="Contoh: Coffee, Non-Coffee, Makanan"
                                                        className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-sm font-semibold text-[#1A1A1A] placeholder:text-[#9E978E] focus:bg-white focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                        required
                                                        autoFocus
                                                    />
                                                    <FieldError
                                                        message={
                                                            form.errors.name
                                                        }
                                                    />
                                                </div>

                                                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-[1fr_8rem]">
                                                    <div className="grid gap-1.5">
                                                        <Label
                                                            htmlFor="slug"
                                                            className="text-xs font-bold text-[#1A1A1A]"
                                                        >
                                                            Slug URL{' '}
                                                            <span className="font-normal text-[#6E6A64]">
                                                                (opsional)
                                                            </span>
                                                        </Label>
                                                        <div className="relative">
                                                            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8C857B]" />
                                                            <Input
                                                                id="slug"
                                                                value={
                                                                    form.data
                                                                        .slug
                                                                }
                                                                onChange={(e) =>
                                                                    form.setData(
                                                                        'slug',
                                                                        e.target
                                                                            .value,
                                                                    )
                                                                }
                                                                placeholder="otomatis"
                                                                className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] pl-9 text-sm font-medium text-[#1A1A1A] placeholder:text-[#9E978E] focus:bg-white focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                            />
                                                        </div>
                                                        <FieldError
                                                            message={
                                                                form.errors.slug
                                                            }
                                                        />
                                                    </div>

                                                    <div className="grid gap-1.5">
                                                        <Label
                                                            htmlFor="sort_order"
                                                            className="text-xs font-bold text-[#1A1A1A]"
                                                        >
                                                            Urutan Tampil
                                                        </Label>
                                                        <div className="relative">
                                                            <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8C857B]" />
                                                            <Input
                                                                id="sort_order"
                                                                type="number"
                                                                min="0"
                                                                value={
                                                                    form.data
                                                                        .sort_order
                                                                }
                                                                onChange={(e) =>
                                                                    form.setData(
                                                                        'sort_order',
                                                                        parseInt(
                                                                            e
                                                                                .target
                                                                                .value,
                                                                        ) || 0,
                                                                    )
                                                                }
                                                                className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] pl-9 text-sm font-bold text-[#1A1A1A] focus:bg-white focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Kotak Visibilitas Pelanggan */}
                                        <div className="space-y-2.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <Link2 className="size-3.5 text-[#C52828]" />
                                                    Visibilitas Menu Pelanggan
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    {form.data.is_active
                                                        ? 'Publik'
                                                        : 'Tersembunyi'}
                                                </span>
                                            </div>
                                            <ToggleField
                                                id="is_active"
                                                checked={form.data.is_active}
                                                onChange={(checked) =>
                                                    form.setData(
                                                        'is_active',
                                                        checked,
                                                    )
                                                }
                                                label="Tampilkan ke pelanggan"
                                                description="Matikan untuk menyembunyikan kategori sementara dari halaman scan QR meja."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Footer Action Bar ala Modal QR Code Meja */}
                        <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                            <span className="hidden text-xs font-semibold text-[#6E6A64] sm:inline">
                                Urutan kecil tampil paling kiri di halaman menu
                                QR
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                    onClick={() => setIsModalOpen(false)}
                                    disabled={form.processing}
                                >
                                    Tutup
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={form.processing}
                                    className="h-11 cursor-pointer gap-2 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                                >
                                    <Check className="size-4" />
                                    {form.processing
                                        ? 'Menyimpan...'
                                        : editingCategory
                                          ? 'Simpan Perubahan'
                                          : 'Tambah Kategori'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deletingCategory}
                onOpenChange={(open) => !open && setDeletingCategory(null)}
                title="Hapus kategori?"
                description={
                    <>
                        Kategori{' '}
                        <b className="font-extrabold text-[#18181B]">
                            {deletingCategory?.name}
                        </b>{' '}
                        beserta{' '}
                        <b className="font-extrabold text-[#18181B]">
                            {deletingCategory?.menus_count ?? 0} menu
                        </b>{' '}
                        di dalamnya akan ikut terhapus.
                    </>
                }
                onConfirm={confirmDelete}
                processing={isDeleting}
            />
        </>
    );
}

CategoriesIndex.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: '/dashboard',
        },
        {
            title: 'Kategori Menu',
            href: '/admin/categories',
        },
    ],
};
