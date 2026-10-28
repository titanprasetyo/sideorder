import { Head, router, useForm } from '@inertiajs/react';
import {
    Armchair,
    CheckCircle2,
    Copy,
    MapPin,
    Pencil,
    Plus,
    Printer,
    QrCode,
    Receipt,
    RefreshCw,
    Trash2,
    UtensilsCrossed,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    AdminPage,
    ConfirmDialog,
    EmptyState,
    FieldError,
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

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

type TableFilter = 'all' | 'occupied' | 'free' | 'inactive';

export default function TablesIndex({ tables, appUrl }: Props) {
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [editingTable, setEditingTable] = useState<CafeTable | null>(null);
    const [selectedQrTable, setSelectedQrTable] = useState<CafeTable | null>(null);
    const [deletingTable, setDeletingTable] = useState<CafeTable | null>(null);
    const [regeneratingTable, setRegeneratingTable] = useState<CafeTable | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<TableFilter>('all');

    const form = useForm({
        table_number: '',
        name: '',
        is_active: true,
    });

    const isOccupied = (t: CafeTable) => (t.active_orders_count ?? 0) > 0;
    const activeCount = tables.filter((t) => t.is_active).length;
    const occupiedCount = tables.filter(isOccupied).length;
    const freeCount = tables.filter((t) => t.is_active && !isOccupied(t)).length;
    const totalOrders = tables.reduce((sum, t) => sum + (t.orders_count ?? 0), 0);

    const filteredTables = useMemo(() => {
        const q = search.toLowerCase().trim();

        return tables.filter((t) => {
            const matchSearch =
                !q || t.table_number.toLowerCase().includes(q) || (t.name ?? '').toLowerCase().includes(q);
            const matchFilter =
                filter === 'all' ||
                (filter === 'occupied' && isOccupied(t)) ||
                (filter === 'free' && t.is_active && !isOccupied(t)) ||
                (filter === 'inactive' && !t.is_active);

            return matchSearch && matchFilter;
        });
    }, [tables, search, filter]);

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

    const confirmDelete = () => {
        if (!deletingTable) return;

        setIsProcessing(true);
        router.delete(`/admin/tables/${deletingTable.id}`, {
            onSuccess: () => toast.success('Meja berhasil dihapus!'),
            onError: (errors) => toast.error(Object.values(errors)[0] || 'Gagal menghapus meja.'),
            onFinish: () => {
                setIsProcessing(false);
                setDeletingTable(null);
            },
        });
    };

    const confirmRegenerateToken = () => {
        if (!regeneratingTable) return;

        const table = regeneratingTable;
        setIsProcessing(true);
        router.post(
            `/admin/tables/${table.id}/regenerate-token`,
            {},
            {
                onSuccess: () => {
                    toast.success('Token QR berhasil diperbarui!');
                    if (selectedQrTable && selectedQrTable.id === table.id) {
                        setIsQrModalOpen(false);
                    }
                },
                onFinish: () => {
                    setIsProcessing(false);
                    setRegeneratingTable(null);
                },
            },
        );
    };

    const getOrderUrl = (qrToken: string) => {
        // Gunakan window.location.origin jika appUrl localhost belum disetel di .env
        const base = typeof window !== 'undefined' ? window.location.origin : appUrl;
        return `${base}/order?table=${qrToken}`;
    };

    const getQrImage = (qrToken: string, size = 300) =>
        `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${encodeURIComponent(getOrderUrl(qrToken))}`;

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

            <AdminPage>
                <PageHeader
                    icon={QrCode}
                    title="Meja & QR Code"
                    description="Kelola meja fisik, cetak QR Code pemesanan, dan amankan token meja."
                    actions={
                        <Button onClick={openCreateModal} className="h-10 gap-2 rounded-xl px-4 font-bold shadow-sm">
                            <Plus className="size-4" />
                            Tambah Meja
                        </Button>
                    }
                />

                <StatGrid>
                    <StatCard icon={Armchair} tone="neutral" label="Total Meja" value={tables.length} hint={`${activeCount} aktif`} />
                    <StatCard icon={UtensilsCrossed} tone="brand" label="Sedang Terisi" value={occupiedCount} hint="Ada pesanan aktif" />
                    <StatCard icon={CheckCircle2} tone="success" label="Siap Dipakai" value={freeCount} hint="Aktif & kosong" />
                    <StatCard icon={Receipt} tone="warning" label="Total Transaksi" value={totalOrders} hint="Riwayat semua meja" />
                </StatGrid>

                {/* Toolbar */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <FilterTabs<TableFilter>
                        value={filter}
                        onChange={setFilter}
                        options={[
                            { value: 'all', label: 'Semua', count: tables.length },
                            { value: 'occupied', label: 'Terisi', count: occupiedCount },
                            { value: 'free', label: 'Kosong', count: freeCount },
                            { value: 'inactive', label: 'Nonaktif', count: tables.length - activeCount },
                        ]}
                    />
                    <SearchInput value={search} onChange={setSearch} placeholder="Cari nomor / lokasi meja..." />
                </div>

                {/* Grid Kartu Meja */}
                {filteredTables.length === 0 ? (
                    <Panel>
                        <EmptyState
                            icon={Armchair}
                            title={tables.length === 0 ? 'Belum ada meja' : 'Meja tidak ditemukan'}
                            description={
                                tables.length === 0
                                    ? 'Daftarkan meja untuk membuat QR Code pemesanan mandiri.'
                                    : 'Coba ubah filter atau kata kunci pencarian.'
                            }
                            action={
                                tables.length === 0 && (
                                    <Button onClick={openCreateModal} className="gap-2 rounded-xl font-bold">
                                        <Plus className="size-4" /> Tambah Meja
                                    </Button>
                                )
                            }
                        />
                    </Panel>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {filteredTables.map((table) => {
                            const occupied = isOccupied(table);

                            return (
                                <div
                                    key={table.id}
                                    className={cn(
                                        'flex flex-col overflow-hidden rounded-2xl border bg-[#FFFDF9] shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md',
                                        occupied ? 'border-[#C52828]/40' : 'border-[#E8DFC8] hover:border-[#DFCFA9]',
                                        !table.is_active && 'opacity-75',
                                    )}
                                >
                                    <div className="flex items-start gap-3.5 p-4">
                                        <div
                                            className={cn(
                                                'flex size-14 shrink-0 flex-col items-center justify-center rounded-2xl',
                                                !table.is_active
                                                    ? 'border border-[#E8DFC8] bg-[#F5EEDC] text-[#78716C]'
                                                    : occupied
                                                      ? 'bg-[#C52828] text-white shadow-sm shadow-[#C52828]/25'
                                                      : 'border border-[#DFCFA9] bg-[#F5EEDC] text-[#5B4126]',
                                            )}
                                        >
                                            <span className="text-[9px] font-bold tracking-wider uppercase opacity-85">Meja</span>
                                            <span className="text-xl leading-none font-black">{table.table_number}</span>
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <p className="truncate text-base font-extrabold text-[#18181B]">
                                                {table.name || `Meja ${table.table_number}`}
                                            </p>
                                            {!table.is_active ? (
                                                <StatusPill tone="neutral" dot>
                                                    Nonaktif
                                                </StatusPill>
                                            ) : occupied ? (
                                                <StatusPill tone="brand" dot>
                                                    Terisi
                                                </StatusPill>
                                            ) : (
                                                <StatusPill tone="success" dot>
                                                    Kosong
                                                </StatusPill>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mx-4 grid grid-cols-2 divide-x divide-[#E8DFC8] rounded-xl border border-[#E8DFC8] bg-[#FAF5E8]">
                                        <div className="px-3 py-2">
                                            <p className="text-[10px] font-bold text-[#78716C]">Pesanan Aktif</p>
                                            <p className={cn('text-sm font-black', occupied ? 'text-[#C52828]' : 'text-[#18181B]')}>
                                                {table.active_orders_count ?? 0}
                                            </p>
                                        </div>
                                        <div className="px-3 py-2">
                                            <p className="text-[10px] font-bold text-[#78716C]">Total Transaksi</p>
                                            <p className="text-sm font-black text-[#18181B]">{table.orders_count ?? 0}</p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2 border-t border-[#E8DFC8] bg-[#FAF6EC] p-3">
                                        <Button
                                            size="sm"
                                            onClick={() => openQrModal(table)}
                                            className="h-9 flex-1 gap-1.5 rounded-lg bg-[#C52828] text-xs font-bold text-white shadow-xs hover:bg-[#A81E1E]"
                                        >
                                            <QrCode className="size-4" /> Lihat QR
                                        </Button>
                                        <IconAction icon={Pencil} label="Edit meja" onClick={() => openEditModal(table)} />
                                        <IconAction icon={Trash2} label="Hapus meja" variant="danger" onClick={() => setDeletingTable(table)} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </AdminPage>

            {/* MODAL 1: Form Tambah / Edit Meja */}
            <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
                <DialogContent className="rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] sm:max-w-md">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <FormDialogHeader
                            icon={editingTable ? Pencil : Armchair}
                            title={editingTable ? 'Edit Meja' : 'Tambah Meja Baru'}
                            description="Masukkan nomor meja fisik dan lokasi penempatannya."
                        />

                        <div className="grid gap-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="table_number" className="text-xs font-bold text-[#18181B]">
                                    Nomor Meja <span className="text-[#C52828]">*</span>
                                </Label>
                                <Input
                                    id="table_number"
                                    value={form.data.table_number}
                                    onChange={(e) => form.setData('table_number', e.target.value)}
                                    placeholder="Contoh: 01, 02, VIP-1"
                                    className="h-10 rounded-xl border-[#DFCFA9] bg-white text-sm font-medium text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                    required
                                    autoFocus
                                />
                                <FieldError message={form.errors.table_number} />
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="table_name" className="text-xs font-bold text-[#18181B]">
                                    Nama / Lokasi <span className="font-normal text-[#78716C]">(opsional)</span>
                                </Label>
                                <div className="relative">
                                    <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#A8A29E]" />
                                    <Input
                                        id="table_name"
                                        value={form.data.name}
                                        onChange={(e) => form.setData('name', e.target.value)}
                                        placeholder="Contoh: Teras Outdoor, Dekat Bar"
                                        className="h-10 rounded-xl border-[#DFCFA9] bg-white pl-9 text-sm font-medium text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                    />
                                </div>
                                <FieldError message={form.errors.name} />
                            </div>

                            <ToggleField
                                id="table_is_active"
                                checked={form.data.is_active}
                                onChange={(checked) => form.setData('is_active', checked)}
                                label="Meja aktif"
                                description="Pelanggan bisa memesan dengan scan QR meja ini."
                            />
                        </div>

                        <DialogFooter className="gap-2 border-t border-[#E8DFC8] pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-xl border-[#DFCFA9] bg-white font-semibold text-[#18181B] hover:bg-[#FAF5E8]"
                                onClick={() => setIsFormModalOpen(false)}
                                disabled={form.processing}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={form.processing}
                                className="rounded-xl bg-[#C52828] font-bold text-white shadow-sm hover:bg-[#A81E1E]"
                            >
                                {form.processing ? 'Menyimpan...' : editingTable ? 'Simpan Perubahan' : 'Tambah Meja'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL 2: Tampilan & Cetak Kartu QR Code Meja */}
            <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
                <DialogContent className="max-h-[94vh] overflow-y-auto rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] sm:max-w-md">
                    {selectedQrTable && (
                        <div className="space-y-5">
                            <DialogHeader className="text-left">
                                <DialogTitle className="text-base font-extrabold text-[#18181B]">QR Code Meja {selectedQrTable.table_number}</DialogTitle>
                                <DialogDescription className="text-xs text-[#78716C]">
                                    Cetak dan tempel pada standee akrilik di meja pelanggan.
                                </DialogDescription>
                            </DialogHeader>

                            {/* Kartu Fisik yang Akan Dicetak */}
                            <div className="rounded-2xl border border-[#E8DFC8] bg-[#FAF5E8] p-5">
                                <div className="printable-qr mx-auto flex w-full max-w-[17rem] flex-col items-center overflow-hidden rounded-2xl border border-[#E8DFC8] bg-white shadow-lg">
                                    <div className="w-full bg-[#C52828] px-5 py-3 text-center text-white">
                                        <p className="text-[10px] font-bold tracking-[0.25em] uppercase opacity-85">Café</p>
                                        <h3 className="text-lg leading-tight font-black tracking-wide">SIDE LINE</h3>
                                    </div>

                                    <div className="flex flex-col items-center gap-3 px-5 py-5">
                                        <div className="rounded-full bg-[#FAF6EC] px-4 py-1 text-xs font-extrabold text-[#5B4126] ring-1 ring-[#E8DFC8]">
                                            MEJA {selectedQrTable.table_number}
                                        </div>

                                        <div className="rounded-xl border border-[#E8DFC8] bg-white p-2.5">
                                            <img
                                                src={getQrImage(selectedQrTable.qr_token)}
                                                alt={`QR Code Meja ${selectedQrTable.table_number}`}
                                                className="size-44"
                                            />
                                        </div>

                                        <div className="text-center">
                                            <p className="text-sm font-extrabold text-[#18181B]">Scan untuk Pesan</p>
                                            <p className="text-[11px] font-medium text-[#78716C]">Pesan & bayar langsung dari meja</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Tautan URL */}
                            <div className="grid gap-1.5">
                                <Label className="text-xs font-bold text-[#18181B]">Tautan pemesanan</Label>
                                <div className="flex items-center gap-2 rounded-xl border border-[#DFCFA9] bg-[#FAF5E8] p-1.5 pl-3">
                                    <span className="flex-1 truncate font-mono text-[11px] font-semibold text-[#5B4126]">
                                        {getOrderUrl(selectedQrTable.qr_token)}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => copyToClipboard(getOrderUrl(selectedQrTable.qr_token))}
                                        className="h-8 shrink-0 gap-1.5 rounded-lg border-[#DFCFA9] bg-white text-xs font-bold text-[#18181B] hover:bg-[#FAF5E8]"
                                    >
                                        <Copy className="size-3.5" /> Salin
                                    </Button>
                                </div>
                            </div>

                            <DialogFooter className="flex-col gap-2 border-t border-[#E8DFC8] pt-4 sm:flex-row sm:items-center sm:justify-between">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setRegeneratingTable(selectedQrTable)}
                                    className="gap-1.5 rounded-lg text-xs font-bold text-[#B91C1C] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                                >
                                    <RefreshCw className="size-3.5" /> Reset Token
                                </Button>

                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="flex-1 rounded-xl border-[#DFCFA9] bg-white font-semibold text-[#18181B] hover:bg-[#FAF5E8]"
                                        onClick={() => setIsQrModalOpen(false)}
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handlePrint}
                                        className="flex-1 gap-1.5 rounded-xl bg-[#C52828] font-bold text-white shadow-sm hover:bg-[#A81E1E]"
                                    >
                                        <Printer className="size-4" /> Cetak Kartu
                                    </Button>
                                </div>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deletingTable}
                onOpenChange={(open) => !open && setDeletingTable(null)}
                title="Hapus meja?"
                description={
                    <>
                        Meja <b className="text-foreground">{deletingTable?.table_number}</b> akan dihapus dan QR Code-nya tidak bisa dipakai lagi.
                    </>
                }
                onConfirm={confirmDelete}
                processing={isProcessing}
            />

            <ConfirmDialog
                open={!!regeneratingTable}
                onOpenChange={(open) => !open && setRegeneratingTable(null)}
                title="Reset token QR?"
                description={
                    <>
                        Stiker QR lama untuk Meja <b className="text-foreground">{regeneratingTable?.table_number}</b> tidak akan bisa dipakai
                        lagi. Anda perlu mencetak ulang kartu QR.
                    </>
                }
                confirmLabel="Ya, Reset Token"
                onConfirm={confirmRegenerateToken}
                processing={isProcessing}
            />
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
