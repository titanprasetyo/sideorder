import { Head, router, useForm } from '@inertiajs/react';
import { Copy, Eye, LayoutGrid, Pencil, Plus, Printer, QrCode, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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

interface CafeTable {
    id: number;
    table_number: string;
    name: string | null;
    qr_token: string;
    is_active: boolean;
    orders_count?: number;
    active_orders_count?: number;
    created_at: string;
}

interface Props {
    tables: CafeTable[];
    appUrl: string;
}

export default function TablesIndex({ tables, appUrl }: Props) {
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [editingTable, setEditingTable] = useState<CafeTable | null>(null);
    const [selectedQrTable, setSelectedQrTable] = useState<CafeTable | null>(null);

    const form = useForm({
        table_number: '',
        name: '',
        is_active: true,
    });

    const openCreateModal = () => {
        setEditingTable(null);
        form.setData({
            table_number: '',
            name: '',
            is_active: true,
        });
        form.clearErrors();
        setIsFormModalOpen(true);
    };

    const openEditModal = (table: CafeTable) => {
        setEditingTable(table);
        form.setData({
            table_number: table.table_number,
            name: table.name || '',
            is_active: table.is_active,
        });
        form.clearErrors();
        setIsFormModalOpen(true);
    };

    const openQrModal = (table: CafeTable) => {
        setSelectedQrTable(table);
        setIsQrModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingTable) {
            form.put(`/admin/tables/${editingTable.id}`, {
                onSuccess: () => {
                    setIsFormModalOpen(false);
                    toast.success('Data meja berhasil diperbarui!');
                },
            });
        } else {
            form.post('/admin/tables', {
                onSuccess: () => {
                    setIsFormModalOpen(false);
                    form.reset();
                    toast.success('Meja baru berhasil ditambahkan!');
                },
            });
        }
    };

    const handleDelete = (table: CafeTable) => {
        if (confirm(`Apakah Anda yakin ingin menghapus Meja "${table.table_number}"?`)) {
            router.delete(`/admin/tables/${table.id}`, {
                onSuccess: () => toast.success('Meja berhasil dihapus!'),
                onError: (errors) => toast.error(Object.values(errors)[0] || 'Gagal menghapus meja.'),
            });
        }
    };

    const handleRegenerateToken = (table: CafeTable) => {
        if (confirm(`PERINGATAN: Membuat ulang token untuk Meja ${table.table_number} akan membuat stiker QR code lama tidak bisa dipakai lagi. Lanjutkan?`)) {
            router.post(`/admin/tables/${table.id}/regenerate-token`, {}, {
                onSuccess: () => {
                    toast.success('Token QR berhasil diperbarui!');
                    if (selectedQrTable && selectedQrTable.id === table.id) {
                        setIsQrModalOpen(false);
                    }
                },
            });
        }
    };

    const getOrderUrl = (qrToken: string) => {
        // Gunakan window.location.origin jika appUrl localhost belum disetel di .env
        const base = typeof window !== 'undefined' ? window.location.origin : appUrl;
        return `${base}/order?table=${qrToken}`;
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Tautan pemesanan berhasil disalin ke clipboard!');
    };

    const handlePrint = () => {
        window.print();
    };

    return (
        <>
            <Head title="Manajemen Meja & QR Code" />

            <div className="flex h-full flex-1 flex-col gap-6 p-4 md:p-8">
                {/* Header */}
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Meja Kafe & QR Code</h1>
                        <p className="text-muted-foreground text-sm">
                            Kelola nomor meja fisik, unduh atau cetak QR Code, dan amankan token pemesanan.
                        </p>
                    </div>
                    <Button onClick={openCreateModal} className="w-fit gap-2">
                        <Plus className="size-4" />
                        Tambah Meja Baru
                    </Button>
                </div>

                {/* Grid Kartu Meja */}
                {tables.length === 0 ? (
                    <div className="rounded-xl border bg-card p-12 text-center text-muted-foreground">
                        <LayoutGrid className="size-10 mx-auto stroke-1 text-muted-foreground/50 mb-3" />
                        <p className="font-medium">Belum ada meja yang didaftarkan.</p>
                        <Button variant="outline" size="sm" onClick={openCreateModal} className="mt-4">
                            Tambah Meja Sekarang
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {tables.map((table) => (
                            <Card key={table.id} className="overflow-hidden flex flex-col justify-between hover:shadow-md transition-shadow">
                                <CardHeader className="p-4 pb-2">
                                    <div className="flex items-center justify-between">
                                        <Badge variant="outline" className="font-mono text-xs font-semibold">
                                            Meja {table.table_number}
                                        </Badge>
                                        {table.is_active ? (
                                            <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20 text-[10px]">
                                                Buka
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                                Tutup
                                            </Badge>
                                        )}
                                    </div>
                                    <CardTitle className="text-base pt-1 font-bold">
                                        {table.name || `Meja ${table.table_number}`}
                                    </CardTitle>
                                </CardHeader>

                                <CardContent className="p-4 pt-0 space-y-2 text-xs text-muted-foreground">
                                    <div className="flex items-center justify-between border-t pt-2">
                                        <span>Pesanan Aktif:</span>
                                        <span className={`font-semibold ${table.active_orders_count && table.active_orders_count > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                            {table.active_orders_count ?? 0} Pesanan
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span>Total Riwayat:</span>
                                        <span>{table.orders_count ?? 0} Transaksi</span>
                                    </div>
                                </CardContent>

                                <CardFooter className="p-3 bg-muted/20 border-t flex items-center justify-between gap-1">
                                    <Button
                                        variant="default"
                                        size="sm"
                                        onClick={() => openQrModal(table)}
                                        className="h-8 text-xs gap-1.5 flex-1"
                                    >
                                        <QrCode className="size-3.5" /> Lihat QR
                                    </Button>

                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => openEditModal(table)}
                                            className="size-8 p-0"
                                            title="Edit Meja"
                                        >
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(table)}
                                            className="size-8 p-0 text-destructive hover:bg-destructive/10"
                                            title="Hapus Meja"
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* MODAL 1: Form Tambah / Edit Meja */}
            <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
                <DialogContent className="sm:max-w-md">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>{editingTable ? 'Edit Meja' : 'Tambah Meja Baru'}</DialogTitle>
                            <DialogDescription>
                                Masukkan nomor meja fisik dan nama area penempatan meja.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="table_number">Nomor Meja <span className="text-destructive">*</span></Label>
                                <Input
                                    id="table_number"
                                    value={form.data.table_number}
                                    onChange={(e) => form.setData('table_number', e.target.value)}
                                    placeholder="Contoh: 01, 02, VIP-1"
                                    required
                                    autoFocus
                                />
                                {form.errors.table_number && (
                                    <p className="text-destructive text-xs">{form.errors.table_number}</p>
                                )}
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="table_name">Nama / Lokasi Meja (Opsional)</Label>
                                <Input
                                    id="table_name"
                                    value={form.data.name}
                                    onChange={(e) => form.setData('name', e.target.value)}
                                    placeholder="Contoh: Teras Outdoor, Lantai 1 Dekat Bar"
                                />
                            </div>

                            <div className="flex items-center space-x-2 pt-2">
                                <Checkbox
                                    id="table_is_active"
                                    checked={form.data.is_active}
                                    onCheckedChange={(checked) => form.setData('is_active', Boolean(checked))}
                                />
                                <Label htmlFor="table_is_active" className="cursor-pointer text-sm font-normal">
                                    Meja ini aktif untuk menerima pesanan customer
                                </Label>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsFormModalOpen(false)} disabled={form.processing}>
                                Batal
                            </Button>
                            <Button type="submit" disabled={form.processing}>
                                {form.processing ? 'Menyimpan...' : editingTable ? 'Simpan Perubahan' : 'Tambah Meja'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL 2: Tampilan & Cetak Kartu QR Code Meja */}
            <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
                <DialogContent className="sm:max-w-md">
                    {selectedQrTable && (
                        <div className="space-y-4 text-center">
                            <DialogHeader>
                                <DialogTitle className="text-center">Kartu QR Meja Kafe</DialogTitle>
                                <DialogDescription className="text-center">
                                    Siap dicetak dan ditempel pada standee akrilik meja {selectedQrTable.table_number}.
                                </DialogDescription>
                            </DialogHeader>

                            {/* Kartu Fisik yang Akan Dicetak */}
                            <div className="mx-auto my-2 p-6 rounded-2xl border-2 border-primary/20 bg-card shadow-lg max-w-xs flex flex-col items-center gap-3">
                                <div className="text-center">
                                    <h3 className="font-extrabold tracking-wider text-primary text-sm uppercase">Café SIDE LINE</h3>
                                    <p className="text-[11px] text-muted-foreground font-medium">Order & Pay from Table</p>
                                </div>

                                <div className="size-20 rounded-full bg-primary/10 flex items-center justify-center font-black text-2xl text-primary font-mono my-1">
                                    {selectedQrTable.table_number}
                                </div>

                                {/* Gambar Barcode QR Code Resolusi Tinggi */}
                                <div className="p-2 bg-white rounded-xl shadow-inner border border-border">
                                    <img
                                        src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(getOrderUrl(selectedQrTable.qr_token))}`}
                                        alt={`QR Code Meja ${selectedQrTable.table_number}`}
                                        className="size-44"
                                    />
                                </div>

                                <div className="text-center space-y-1">
                                    <p className="font-semibold text-xs text-foreground">Scan untuk Pesan Menu</p>
                                    <p className="text-[10px] text-muted-foreground">Tidak perlu antre di kasir</p>
                                </div>
                            </div>

                            {/* Tautan URL & Tombol Aksi */}
                            <div className="flex items-center gap-2 bg-muted p-2 rounded-lg text-xs font-mono">
                                <span className="truncate flex-1 text-left text-muted-foreground">
                                    {getOrderUrl(selectedQrTable.qr_token)}
                                </span>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => copyToClipboard(getOrderUrl(selectedQrTable.qr_token))}
                                    className="size-7 p-0 shrink-0"
                                    title="Salin Tautan"
                                >
                                    <Copy className="size-3.5" />
                                </Button>
                            </div>

                            <DialogFooter className="flex sm:justify-between items-center gap-2 pt-2 border-t">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleRegenerateToken(selectedQrTable)}
                                    className="text-xs text-destructive hover:bg-destructive/10 gap-1.5"
                                >
                                    <RefreshCw className="size-3.5" /> Reset Token QR
                                </Button>

                                <div className="flex gap-2">
                                    <Button type="button" variant="outline" onClick={() => setIsQrModalOpen(false)}>
                                        Tutup
                                    </Button>
                                    <Button type="button" onClick={handlePrint} className="gap-1.5">
                                        <Printer className="size-4" /> Cetak Kartu
                                    </Button>
                                </div>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

TablesIndex.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: '/dashboard',
        },
        {
            title: 'Meja & QR Code',
            href: '/admin/tables',
        },
    ],
};