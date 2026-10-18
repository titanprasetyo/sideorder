import { Head, router, useForm } from '@inertiajs/react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);

    const form = useForm({
        name: '',
        slug: '',
        sort_order: 0,
        is_active: true,
    });

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

    const handleDelete = (category: Category) => {
        if (confirm(`Apakah Anda yakin ingin menghapus kategori "${category.name}"? Semua menu di dalamnya akan ikut terhapus.`)) {
            router.delete(`/admin/categories/${category.id}`, {
                onSuccess: () => {
                    toast.success('Kategori berhasil dihapus!');
                },
            });
        }
    };

    return (
        <>
            <Head title="Manajemen Kategori Menu" />

            <div className="flex h-full flex-1 flex-col gap-6 p-4 md:p-8">
                {/* Header Halaman */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Kategori Menu</h1>
                        <p className="text-muted-foreground text-sm">
                            Kelola kategori minuman dan makanan Café SIDE LINE.
                        </p>
                    </div>
                    <Button onClick={openCreateModal} className="w-fit gap-2">
                        <Plus className="size-4" />
                        Tambah Kategori
                    </Button>
                </div>

                {/* Tabel Kategori */}
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b bg-muted/50 text-muted-foreground">
                                <tr>
                                    <th className="px-6 py-4 font-semibold w-16">Urutan</th>
                                    <th className="px-6 py-4 font-semibold">Nama Kategori</th>
                                    <th className="px-6 py-4 font-semibold">Slug (URL)</th>
                                    <th className="px-6 py-4 font-semibold text-center">Jumlah Menu</th>
                                    <th className="px-6 py-4 font-semibold text-center">Status</th>
                                    <th className="px-6 py-4 font-semibold text-right">Aksi</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <Layers className="size-8 stroke-1 text-muted-foreground/50" />
                                                <p>Belum ada kategori menu yang dibuat.</p>
                                                <Button variant="outline" size="sm" onClick={openCreateModal} className="mt-2">
                                                    Tambah Sekarang
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    categories.map((cat) => (
                                        <tr key={cat.id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4 font-mono font-medium text-muted-foreground">
                                                #{cat.sort_order}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-foreground">
                                                {cat.name}
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                                                {cat.slug}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <Badge variant="secondary" className="font-mono">
                                                    {cat.menus_count ?? 0} Menu
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                {cat.is_active ? (
                                                    <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 border-emerald-500/20">
                                                        Aktif
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-muted-foreground">
                                                        Nonaktif
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEditModal(cat)}
                                                        className="size-8 p-0"
                                                        title="Edit Kategori"
                                                    >
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleDelete(cat)}
                                                        className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        title="Hapus Kategori"
                                                    >
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Modal Tambah / Edit Kategori */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>
                                {editingCategory ? 'Edit Kategori' : 'Tambah Kategori Baru'}
                            </DialogTitle>
                            <DialogDescription>
                                {editingCategory
                                    ? 'Perbarui detail kategori menu kafe.'
                                    : 'Kategori baru untuk mengelompokkan menu makanan dan minuman.'}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            {/* Input Nama */}
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nama Kategori <span className="text-destructive">*</span></Label>
                                <Input
                                    id="name"
                                    value={form.data.name}
                                    onChange={(e) => form.setData('name', e.target.value)}
                                    placeholder="Contoh: Coffee, Non-Coffee, Makanan"
                                    required
                                    autoFocus
                                />
                                {form.errors.name && (
                                    <p className="text-destructive text-xs">{form.errors.name}</p>
                                )}
                            </div>

                            {/* Input Slug */}
                            <div className="grid gap-2">
                                <Label htmlFor="slug">Slug URL (Opsional)</Label>
                                <Input
                                    id="slug"
                                    value={form.data.slug}
                                    onChange={(e) => form.setData('slug', e.target.value)}
                                    placeholder="Otomatis jika dikosongkan (contoh: coffee)"
                                />
                                {form.errors.slug && (
                                    <p className="text-destructive text-xs">{form.errors.slug}</p>
                                )}
                            </div>

                            {/* Input Urutan */}
                            <div className="grid gap-2">
                                <Label htmlFor="sort_order">Urutan Tampil</Label>
                                <Input
                                    id="sort_order"
                                    type="number"
                                    min="0"
                                    value={form.data.sort_order}
                                    onChange={(e) => form.setData('sort_order', parseInt(e.target.value) || 0)}
                                />
                                <p className="text-muted-foreground text-xs">
                                    Angka lebih kecil akan tampil lebih awal di tab menu customer.
                                </p>
                            </div>

                            {/* Status Aktif */}
                            <div className="flex items-center space-x-2 pt-2">
                                <Checkbox
                                    id="is_active"
                                    checked={form.data.is_active}
                                    onCheckedChange={(checked) => form.setData('is_active', Boolean(checked))}
                                />
                                <Label htmlFor="is_active" className="cursor-pointer text-sm font-normal">
                                    Tampilkan kategori ini ke pelanggan (Aktif)
                                </Label>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                                disabled={form.processing}
                            >
                                Batal
                            </Button>
                            <Button type="submit" disabled={form.processing}>
                                {form.processing ? 'Menyimpan...' : editingCategory ? 'Simpan Perubahan' : 'Tambah Kategori'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
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