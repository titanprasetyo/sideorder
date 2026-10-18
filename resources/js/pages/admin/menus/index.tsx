import { Head, router } from '@inertiajs/react';
import { Coffee, Image as ImageIcon, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

export default function MenusIndex({ menus, categories }: Props) {
    const [selectedCategory, setSelectedCategory] = useState<number | 'all'>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingMenu, setEditingMenu] = useState<Menu | null>(null);

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

    const handleDelete = (menu: Menu) => {
        if (confirm(`Apakah Anda yakin ingin menghapus menu "${menu.name}"?`)) {
            router.delete(`/admin/menus/${menu.id}`, {
                onSuccess: () => toast.success('Menu berhasil dihapus!'),
            });
        }
    };

    const filteredMenus = selectedCategory === 'all'
        ? menus
        : menus.filter((m) => m.category_id === selectedCategory);

    return (
        <>
            <Head title="Manajemen Menu Kafe" />

            <div className="flex h-full flex-1 flex-col gap-6 p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Menu & Produk Kafe</h1>
                        <p className="text-muted-foreground text-sm">
                            Kelola produk makanan, minuman, harga, foto, serta opsi ukuran dan topping.
                        </p>
                    </div>
                    <Button onClick={openCreateModal} className="w-fit gap-2">
                        <Plus className="size-4" />
                        Tambah Menu Baru
                    </Button>
                </div>

                {/* Filter Kategori */}
                <div className="flex flex-wrap gap-2 items-center">
                    <Button
                        variant={selectedCategory === 'all' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedCategory('all')}
                        className="rounded-full text-xs"
                    >
                        Semua Kategori ({menus.length})
                    </Button>
                    {categories.map((cat) => (
                        <Button
                            key={cat.id}
                            variant={selectedCategory === cat.id ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setSelectedCategory(cat.id)}
                            className="rounded-full text-xs"
                        >
                            {cat.name} ({menus.filter((m) => m.category_id === cat.id).length})
                        </Button>
                    ))}
                </div>

                {/* Katalog Card Grid */}
                {filteredMenus.length === 0 ? (
                    <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
                        <Coffee className="size-10 mx-auto stroke-1 text-muted-foreground/50 mb-3" />
                        <p className="font-medium">Belum ada menu di kategori ini.</p>
                        <Button variant="outline" size="sm" onClick={openCreateModal} className="mt-4">
                            Tambah Menu Sekarang
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {filteredMenus.map((menu) => (
                            <Card key={menu.id} className="overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                                <div>
                                    {/* Foto Menu */}
                                    <div className="relative aspect-video w-full bg-muted overflow-hidden">
                                        {menu.image_path ? (
                                            <img
                                                src={`/storage/${menu.image_path}`}
                                                alt={menu.name}
                                                className="size-full object-cover"
                                            />
                                        ) : (
                                            <div className="size-full flex items-center justify-center text-muted-foreground/40">
                                                <ImageIcon className="size-8 stroke-1" />
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2">
                                            {menu.is_active ? (
                                                <Badge className="bg-emerald-500/90 text-white text-[10px]">Tersedia</Badge>
                                            ) : (
                                                <Badge variant="destructive" className="text-[10px]">Habis</Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* Detail */}
                                    <CardContent className="p-4 space-y-2">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                                            <span>{menu.category?.name || 'Tanpa Kategori'}</span>
                                            <span className="font-mono text-emerald-600 font-semibold">
                                                {formatRupiah(menu.base_price)}
                                            </span>
                                        </div>
                                        <h3 className="font-semibold text-base line-clamp-1">{menu.name}</h3>
                                        {menu.description && (
                                            <p className="text-xs text-muted-foreground line-clamp-2">{menu.description}</p>
                                        )}

                                        {/* Badge Opsi */}
                                        {menu.option_groups && menu.option_groups.length > 0 && (
                                            <div className="flex flex-wrap gap-1 pt-1">
                                                {menu.option_groups.map((g) => (
                                                    <Badge key={g.id} variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                                                        {g.name} ({g.option_items.length})
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </div>

                                {/* Tombol Aksi */}
                                <div className="p-4 pt-0 border-t flex items-center justify-end gap-2 mt-2">
                                    <Button variant="ghost" size="sm" onClick={() => openEditModal(menu)} className="size-8 p-0">
                                        <Pencil className="size-4" />
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => handleDelete(menu)} className="size-8 p-0 text-destructive hover:bg-destructive/10">
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* Modal Tambah / Edit Menu */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <DialogHeader>
                            <DialogTitle>{editingMenu ? 'Edit Menu Kafe' : 'Tambah Menu Baru'}</DialogTitle>
                            <DialogDescription>
                                Atur informasi dasar, harga reguler, foto, serta variasi ukuran dan topping.
                            </DialogDescription>
                        </DialogHeader>

                        {/* BAGIAN 1: INFORMASI DASAR */}
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground border-b pb-1">
                                1. Informasi Produk
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="category">Kategori <span className="text-destructive">*</span></Label>
                                    <Select value={categoryId} onValueChange={setCategoryId} required>
                                        <SelectTrigger id="category">
                                            <SelectValue placeholder="Pilih Kategori" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {categories.map((c) => (
                                                <SelectItem key={c.id} value={c.id.toString()}>
                                                    {c.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="name">Nama Menu <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="name"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Contoh: Kopi Susu Gula Aren"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="price">Harga Dasar (Rp) <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        min="0"
                                        step="500"
                                        value={basePrice}
                                        onChange={(e) => setBasePrice(e.target.value)}
                                        placeholder="18000"
                                        required
                                    />
                                    <p className="text-[11px] text-muted-foreground">Harga ukuran standar/regular.</p>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="image">Foto Produk</Label>
                                    <Input id="image" type="file" accept="image/*" onChange={handleImageChange} />
                                    {imagePreview && (
                                        <div className="mt-1 size-16 rounded border overflow-hidden">
                                            <img src={imagePreview} alt="Preview" className="size-full object-cover" />
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="description">Deskripsi Singkat</Label>
                                <Input
                                    id="description"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Espresso dengan susu segar dan sirup aren alami..."
                                />
                            </div>

                            <div className="flex items-center space-x-2 pt-1">
                                <Checkbox
                                    id="menu_is_active"
                                    checked={isActive}
                                    onCheckedChange={(checked) => setIsActive(Boolean(checked))}
                                />
                                <Label htmlFor="menu_is_active" className="cursor-pointer text-sm font-normal">
                                    Menu ini tersedia untuk dipesan customer (Aktif)
                                </Label>
                            </div>
                        </div>

                        {/* BAGIAN 2: KUSTOMISASI (UKURAN & TOPPING) */}
                        <div className="space-y-4 pt-2">
                            <div className="flex items-center justify-between border-b pb-1">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    2. Opsi Ukuran & Kustomisasi Topping
                                </h4>
                                <Button type="button" variant="outline" size="sm" onClick={addOptionGroup} className="h-7 text-xs gap-1">
                                    <Plus className="size-3" /> Tambah Grup Opsi
                                </Button>
                            </div>

                            {optionGroups.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic py-2">
                                    Belum ada grup opsi. Produk ini hanya memiliki satu harga dasar (tanpa pilihan ukuran/topping).
                                </p>
                            ) : (
                                optionGroups.map((group, gIdx) => (
                                    <div key={gIdx} className="rounded-lg border bg-muted/30 p-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <Input
                                                value={group.name}
                                                onChange={(e) => updateGroupField(gIdx, 'name', e.target.value)}
                                                placeholder="Nama Grup (misal: Ukuran, Level Es, Topping)"
                                                className="h-8 text-xs font-semibold bg-background"
                                                required
                                            />
                                            <Select
                                                value={group.selection_type}
                                                onValueChange={(val) => updateGroupField(gIdx, 'selection_type', val)}
                                            >
                                                <SelectTrigger className="w-36 h-8 text-xs bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="single">Pilih 1 (Radio)</SelectItem>
                                                    <SelectItem value="multiple">Bisa Banyak (Checkbox)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeOptionGroup(gIdx)}
                                                className="size-8 p-0 text-destructive"
                                            >
                                                <Trash2 className="size-4" />
                                            </Button>
                                        </div>

                                        <div className="flex items-center space-x-2 pl-1">
                                            <Checkbox
                                                id={`req_${gIdx}`}
                                                checked={group.is_required}
                                                onCheckedChange={(checked) => updateGroupField(gIdx, 'is_required', Boolean(checked))}
                                            />
                                            <Label htmlFor={`req_${gIdx}`} className="text-xs cursor-pointer">
                                                Wajib Dipilih Customer (misal ukuran harus dipilih salah satu)
                                            </Label>
                                        </div>

                                        {/* Daftar Opsi di dalam Grup */}
                                        <div className="space-y-1.5 pl-2 border-l-2 border-border/70 ml-1">
                                            {group.items.map((item, iIdx) => (
                                                <div key={iIdx} className="flex items-center gap-2">
                                                    <Input
                                                        value={item.name}
                                                        onChange={(e) => updateItemField(gIdx, iIdx, 'name', e.target.value)}
                                                        placeholder="Nama Opsi (Regular, Large, Extra Shot)"
                                                        className="h-7 text-xs bg-background flex-1"
                                                        required
                                                    />
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-[11px] text-muted-foreground">+Rp</span>
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="500"
                                                            value={item.additional_price}
                                                            onChange={(e) => updateItemField(gIdx, iIdx, 'additional_price', parseFloat(e.target.value) || 0)}
                                                            className="h-7 w-20 text-xs bg-background"
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => removeOptionItem(gIdx, iIdx)}
                                                        className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                                    >
                                                        <X className="size-3.5" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => addOptionItem(gIdx)}
                                                className="h-6 text-[11px] text-primary gap-1 px-2 mt-1"
                                            >
                                                <Plus className="size-3" /> Tambah Pilihan
                                            </Button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <DialogFooter className="border-t pt-4">
                            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isSubmitting}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Menyimpan...' : editingMenu ? 'Simpan Perubahan' : 'Tambah Menu'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
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