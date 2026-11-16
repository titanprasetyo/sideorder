import { Head, router, useForm } from '@inertiajs/react';
import {
    Armchair,
    Camera,
    Check,
    CheckCircle2,
    Coffee,
    Copy,
    Download,
    ExternalLink,
    Link2,
    MapPin,
    Pencil,
    Plus,
    Printer,
    QrCode,
    Receipt,
    RefreshCw,
    Sparkles,
    Trash2,
    UtensilsCrossed,
} from 'lucide-react';
import QRCode from 'qrcode';
import { useMemo, useRef, useState } from 'react';
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
    StandeeModalCard,
    StatCard,
    StatGrid,
    StatusPill,
    ToggleField,
} from '@/components/admin/admin-ui';
import { Button } from '@/components/ui/button';
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
import { copyTextToClipboard } from '@/hooks/use-clipboard';
import { downloadDataUrlSafely } from '@/lib/safe-download';
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

// Helper pembersih nomor meja agar tidak terjadi duplikasi "Meja Meja 01"
const getCleanTableNumber = (num: string) => {
    return (num || '').trim().replace(/^meja\s+/i, '');
};

const formatTableTitle = (num: string) => {
    const clean = getCleanTableNumber(num);
    return clean ? `Meja ${clean}` : 'Meja';
};

const formatTableBadge = (num: string) => {
    const clean = getCleanTableNumber(num);
    return clean ? `MEJA ${clean}` : 'MEJA';
};

export default function TablesIndex({ tables, appUrl }: Props) {
    const [isFormModalOpen, setIsFormModalOpen] = useState(false);
    const [isQrModalOpen, setIsQrModalOpen] = useState(false);
    const [editingTable, setEditingTable] = useState<CafeTable | null>(null);
    const [selectedQrTable, setSelectedQrTable] = useState<CafeTable | null>(
        null,
    );
    const [deletingTable, setDeletingTable] = useState<CafeTable | null>(null);
    const [regeneratingTable, setRegeneratingTable] =
        useState<CafeTable | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<TableFilter>('all');
    const [isCopied, setIsCopied] = useState(false);
    const urlInputRef = useRef<HTMLInputElement | null>(null);

    const form = useForm({
        table_number: '',
        name: '',
        is_active: true,
    });

    const isOccupied = (t: CafeTable) => (t.active_orders_count ?? 0) > 0;
    const activeCount = tables.filter((t) => t.is_active).length;
    const occupiedCount = tables.filter(isOccupied).length;
    const freeCount = tables.filter(
        (t) => t.is_active && !isOccupied(t),
    ).length;
    const totalOrders = tables.reduce(
        (sum, t) => sum + (t.orders_count ?? 0),
        0,
    );

    const filteredTables = useMemo(() => {
        const q = search.toLowerCase().trim();

        return tables.filter((t) => {
            const matchSearch =
                !q ||
                t.table_number.toLowerCase().includes(q) ||
                (t.name ?? '').toLowerCase().includes(q);
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
        setIsCopied(false);
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
            onError: (errors) =>
                toast.error(
                    Object.values(errors)[0] || 'Gagal menghapus meja.',
                ),
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
                preserveScroll: true,
                onSuccess: (page) => {
                    toast.success('Token QR berhasil diperbarui!');
                    const updatedTables = (page.props as unknown as Props)
                        ?.tables;
                    if (Array.isArray(updatedTables)) {
                        const updated = updatedTables.find(
                            (t) => t.id === table.id,
                        );
                        if (updated && selectedQrTable?.id === table.id) {
                            setSelectedQrTable(updated);
                            setIsCopied(false);
                        }
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
        const base =
            typeof window !== 'undefined' ? window.location.origin : appUrl;
        return `${base}/order?table=${qrToken}`;
    };

    const getQrImage = (qrToken: string, size = 420) =>
        `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&ecc=H&margin=1&color=18181B&bgcolor=FFFFFF&data=${encodeURIComponent(getOrderUrl(qrToken))}`;

    const copyToClipboard = async (text: string) => {
        let success = await copyTextToClipboard(text);

        // Cadangan langsung menggunakan elemen input URL di dalam modal jika browser memblokir textarea dinamis
        if (!success && urlInputRef.current) {
            try {
                urlInputRef.current.focus({ preventScroll: true });
                urlInputRef.current.select();
                urlInputRef.current.setSelectionRange(0, text.length);
                success = document.execCommand('copy');
            } catch {
                success = false;
            }
        }

        if (success) {
            setIsCopied(true);
            toast.success('Tautan pemesanan berhasil disalin ke clipboard!');
            setTimeout(() => setIsCopied(false), 2500);
        } else {
            if (urlInputRef.current) {
                urlInputRef.current.focus({ preventScroll: true });
                urlInputRef.current.select();
            }
            toast.error('Tautan telah dipilih. Tekan Ctrl+C untuk menyalin.');
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadTableQr = async (table: CafeTable) => {
        try {
            const url = getOrderUrl(table.qr_token);
            const dataUrl = await QRCode.toDataURL(url, {
                width: 1000,
                margin: 2,
                errorCorrectionLevel: 'H',
                color: {
                    dark: '#18181B',
                    light: '#FFFFFF',
                },
            });
            const cleanNum = table.table_number.replace(/[^a-zA-Z0-9_-]/g, '_');
            await downloadDataUrlSafely(
                dataUrl,
                `QR_Meja_${cleanNum}_SIDELINE.png`,
            );
            toast.success(
                `Gambar QR Meja ${table.table_number} berhasil diunduh!`,
            );
        } catch {
            window.open(getQrImage(table.qr_token, 1000), '_blank');
        }
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
                        <Button
                            onClick={openCreateModal}
                            className="h-10 gap-2 rounded-xl px-4 font-bold shadow-sm"
                        >
                            <Plus className="size-4" />
                            Tambah Meja
                        </Button>
                    }
                />

                <StatGrid>
                    <StatCard
                        icon={Armchair}
                        tone="neutral"
                        label="Total Meja"
                        value={tables.length}
                        hint={`${activeCount} aktif`}
                    />
                    <StatCard
                        icon={UtensilsCrossed}
                        tone="brand"
                        label="Sedang Terisi"
                        value={occupiedCount}
                        hint="Ada pesanan aktif"
                    />
                    <StatCard
                        icon={CheckCircle2}
                        tone="success"
                        label="Siap Dipakai"
                        value={freeCount}
                        hint="Aktif & kosong"
                    />
                    <StatCard
                        icon={Receipt}
                        tone="warning"
                        label="Total Transaksi"
                        value={totalOrders}
                        hint="Riwayat semua meja"
                    />
                </StatGrid>

                {/* Toolbar */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <FilterTabs<TableFilter>
                        value={filter}
                        onChange={setFilter}
                        options={[
                            {
                                value: 'all',
                                label: 'Semua',
                                count: tables.length,
                            },
                            {
                                value: 'occupied',
                                label: 'Terisi',
                                count: occupiedCount,
                            },
                            {
                                value: 'free',
                                label: 'Kosong',
                                count: freeCount,
                            },
                            {
                                value: 'inactive',
                                label: 'Nonaktif',
                                count: tables.length - activeCount,
                            },
                        ]}
                    />
                    <SearchInput
                        value={search}
                        onChange={setSearch}
                        placeholder="Cari nomor / lokasi meja..."
                    />
                </div>

                {/* Grid Kartu Meja */}
                {filteredTables.length === 0 ? (
                    <Panel>
                        <EmptyState
                            icon={Armchair}
                            title={
                                tables.length === 0
                                    ? 'Belum ada meja'
                                    : 'Meja tidak ditemukan'
                            }
                            description={
                                tables.length === 0
                                    ? 'Daftarkan meja untuk membuat QR Code pemesanan mandiri.'
                                    : 'Coba ubah filter atau kata kunci pencarian.'
                            }
                            action={
                                tables.length === 0 && (
                                    <Button
                                        onClick={openCreateModal}
                                        className="gap-2 rounded-xl font-bold"
                                    >
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
                                        occupied
                                            ? 'border-[#C52828]/40'
                                            : 'border-[#E8DFC8] hover:border-[#DFCFA9]',
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
                                            <span className="text-[9px] font-bold tracking-wider uppercase opacity-85">
                                                Meja
                                            </span>
                                            <span className="text-xl leading-none font-black">
                                                {getCleanTableNumber(
                                                    table.table_number,
                                                )}
                                            </span>
                                        </div>
                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <p className="truncate text-base font-extrabold text-[#18181B]">
                                                {table.name ||
                                                    formatTableTitle(
                                                        table.table_number,
                                                    )}
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
                                            <p className="text-[10px] font-bold text-[#78716C]">
                                                Pesanan Aktif
                                            </p>
                                            <p
                                                className={cn(
                                                    'text-sm font-black',
                                                    occupied
                                                        ? 'text-[#C52828]'
                                                        : 'text-[#18181B]',
                                                )}
                                            >
                                                {table.active_orders_count ?? 0}
                                            </p>
                                        </div>
                                        <div className="px-3 py-2">
                                            <p className="text-[10px] font-bold text-[#78716C]">
                                                Total Transaksi
                                            </p>
                                            <p className="text-sm font-black text-[#18181B]">
                                                {table.orders_count ?? 0}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2 border-t border-[#E8DFC8] bg-[#FAF6EC] p-3">
                                        <Button
                                            size="sm"
                                            onClick={() => openQrModal(table)}
                                            className="h-9 flex-1 gap-1.5 rounded-lg bg-[#C52828] text-xs font-bold text-white shadow-xs hover:bg-[#A81E1E]"
                                        >
                                            <QrCode className="size-4" /> Lihat
                                            QR
                                        </Button>
                                        <IconAction
                                            icon={Copy}
                                            label="Salin link meja"
                                            onClick={() =>
                                                copyToClipboard(
                                                    getOrderUrl(table.qr_token),
                                                )
                                            }
                                        />
                                        <IconAction
                                            icon={Pencil}
                                            label="Edit meja"
                                            onClick={() => openEditModal(table)}
                                        />
                                        <IconAction
                                            icon={Trash2}
                                            label="Hapus meja"
                                            variant="danger"
                                            onClick={() =>
                                                setDeletingTable(table)
                                            }
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </AdminPage>

            {/* MODAL 1: Form Tambah / Edit Meja (Gaya 2 Kolom Standee QR Meja) */}
            <Dialog open={isFormModalOpen} onOpenChange={setIsFormModalOpen}>
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    <form
                        onSubmit={handleSubmit}
                        className="flex max-h-[92dvh] flex-col"
                    >
                        {/* Sticky Header */}
                        <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                            <FormDialogHeader
                                icon={editingTable ? Pencil : Armchair}
                                badge="Standee Meja Digital"
                                tag={
                                    form.data.table_number
                                        ? formatTableBadge(
                                              form.data.table_number,
                                          )
                                        : 'MEJA BARU'
                                }
                                statusLabel={
                                    form.data.is_active ? 'Aktif' : 'Nonaktif'
                                }
                                statusActive={form.data.is_active}
                                title={
                                    editingTable
                                        ? `Edit ${formatTableTitle(form.data.table_number || editingTable.table_number)}`
                                        : 'Tambah Meja Baru'
                                }
                                description="Atur nomor meja fisik dan lokasi penempatan standee QR pemesanan mandiri."
                            />
                        </div>

                        {/* Body 2 Kolom ala Modal QR Code Meja */}
                        <div className="flex-1 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5">
                            <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                {/* KOLOM KIRI: Kartu Standee Preview Meja */}
                                <StandeeModalCard
                                    pillPrimary={
                                        form.data.table_number
                                            ? formatTableBadge(
                                                  form.data.table_number,
                                              )
                                            : 'MEJA BARU'
                                    }
                                    pillSecondary={
                                        form.data.name || 'Area Utama'
                                    }
                                    topBadgeIcon={Camera}
                                    topBadgeLabel="SCAN QR"
                                    heading="Scan untuk Lihat Menu"
                                    subheading="Arahkan kamera smartphone untuk memilih menu favorit dari meja ini"
                                    steps={[
                                        { num: '01', label: 'Buka Kamera' },
                                        { num: '02', label: 'Pilih Menu' },
                                        { num: '03', label: 'Siap Diantar' },
                                    ]}
                                >
                                    <div className="flex size-36 flex-col items-center justify-center gap-1.5 bg-[#FAF5E8] p-3 text-center">
                                        {editingTable?.qr_token ? (
                                            <img
                                                src={getQrImage(
                                                    editingTable.qr_token,
                                                    240,
                                                )}
                                                alt="Preview QR"
                                                className="size-full object-contain"
                                            />
                                        ) : (
                                            <>
                                                <div className="flex size-14 items-center justify-center rounded-2xl bg-[#C52828] text-white shadow-sm">
                                                    <QrCode className="size-8" />
                                                </div>
                                                <span className="font-heading text-xs font-black tracking-wider text-[#18181B] uppercase">
                                                    {form.data.table_number
                                                        ? formatTableBadge(
                                                              form.data
                                                                  .table_number,
                                                          )
                                                        : 'QR OTOMATIS'}
                                                </span>
                                                <span className="text-[9.5px] font-medium text-[#78716C]">
                                                    Dibuat saat disimpan
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </StandeeModalCard>

                                {/* KOLOM KANAN: Panel Informasi & Form Meja */}
                                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                    <div className="space-y-3.5">
                                        {/* Dark Banner ala Card QRIS */}
                                        <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                    QR
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold tracking-wide text-white uppercase">
                                                        SIDE LINE COFFEE •{' '}
                                                        {form.data.table_number
                                                            ? formatTableBadge(
                                                                  form.data
                                                                      .table_number,
                                                              )
                                                            : 'MEJA BARU'}
                                                    </p>
                                                    <p className="truncate text-[10px] text-white/60">
                                                        {form.data.name ||
                                                            'Area Utama Kafe'}{' '}
                                                        • Token Terenkripsi
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[10px] font-medium text-white/60">
                                                    Total Order
                                                </p>
                                                <p className="text-sm font-black text-white tabular-nums">
                                                    {editingTable?.orders_count ??
                                                        0}
                                                    x
                                                </p>
                                            </div>
                                        </div>

                                        {/* Kotak Form Nomor & Lokasi Meja */}
                                        <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <Sparkles className="size-3.5 text-[#C52828]" />
                                                    Identitas & Lokasi Meja
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    Standee A6
                                                </span>
                                            </div>

                                            <div className="grid gap-3">
                                                <div className="grid gap-1.5">
                                                    <Label
                                                        htmlFor="table_number"
                                                        className="text-xs font-bold text-[#1A1A1A]"
                                                    >
                                                        Nomor Meja{' '}
                                                        <span className="text-[#C52828]">
                                                            *
                                                        </span>
                                                    </Label>
                                                    <Input
                                                        id="table_number"
                                                        value={
                                                            form.data
                                                                .table_number
                                                        }
                                                        onChange={(e) =>
                                                            form.setData(
                                                                'table_number',
                                                                e.target.value,
                                                            )
                                                        }
                                                        placeholder="Contoh: 01, 02, VIP-1"
                                                        className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-sm font-semibold text-[#1A1A1A] placeholder:text-[#9E978E] focus:bg-white focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                        required
                                                        autoFocus
                                                    />
                                                    <FieldError
                                                        message={
                                                            form.errors
                                                                .table_number
                                                        }
                                                    />
                                                </div>

                                                <div className="grid gap-1.5">
                                                    <Label
                                                        htmlFor="table_name"
                                                        className="text-xs font-bold text-[#1A1A1A]"
                                                    >
                                                        Nama / Lokasi{' '}
                                                        <span className="font-normal text-[#6E6A64]">
                                                            (opsional)
                                                        </span>
                                                    </Label>
                                                    <div className="relative">
                                                        <MapPin className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8C857B]" />
                                                        <Input
                                                            id="table_name"
                                                            value={
                                                                form.data.name
                                                            }
                                                            onChange={(e) =>
                                                                form.setData(
                                                                    'name',
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="Contoh: Teras Outdoor, Dekat Bar, Dibelakang AC"
                                                            className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] pl-9 text-sm font-medium text-[#1A1A1A] placeholder:text-[#9E978E] focus:bg-white focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                        />
                                                    </div>
                                                    <FieldError
                                                        message={
                                                            form.errors.name
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Kotak Status Pemesanan Mandiri */}
                                        <div className="space-y-2.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <Link2 className="size-3.5 text-[#C52828]" />
                                                    Status Pemesanan Mandiri
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    {form.data.is_active
                                                        ? 'Siap Scan'
                                                        : 'Nonaktif'}
                                                </span>
                                            </div>
                                            <ToggleField
                                                id="table_is_active"
                                                checked={form.data.is_active}
                                                onChange={(checked) =>
                                                    form.setData(
                                                        'is_active',
                                                        checked,
                                                    )
                                                }
                                                label="Meja aktif untuk pemesanan"
                                                description="Pelanggan bisa langsung memesan dari meja ini dengan scan QR Code."
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Footer Action Bar ala Modal QR Code Meja */}
                        <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                            <span className="hidden text-xs font-semibold text-[#6E6A64] sm:inline">
                                Token QR meja terenkripsi otomatis oleh sistem
                            </span>
                            <div className="ml-auto flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                                    onClick={() => setIsFormModalOpen(false)}
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
                                        : editingTable
                                          ? 'Simpan Perubahan'
                                          : 'Tambah Meja'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL 2: Tampilan & Cetak Kartu QR Code Meja (Gaya Card Modal Pemesanan Meja QRIS) */}
            <Dialog open={isQrModalOpen} onOpenChange={setIsQrModalOpen}>
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl">
                    {selectedQrTable && (
                        <>
                            {/* Sticky Header Bar ala Card Modal QRIS */}
                            <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pr-14 pb-3.5">
                                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-[#FDECEB] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#C52828] uppercase">
                                        <QrCode className="size-3" />
                                        Standee Meja Digital
                                    </span>
                                    <span className="rounded-md bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                                        {formatTableBadge(
                                            selectedQrTable.table_number,
                                        )}
                                    </span>
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase',
                                            selectedQrTable.is_active
                                                ? 'bg-emerald-100 text-emerald-800'
                                                : 'bg-neutral-200 text-neutral-700',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'size-1.5 rounded-full',
                                                selectedQrTable.is_active
                                                    ? 'bg-emerald-500'
                                                    : 'bg-neutral-500',
                                            )}
                                        />
                                        {selectedQrTable.is_active
                                            ? 'Aktif'
                                            : 'Nonaktif'}
                                    </span>
                                </div>
                                <DialogHeader className="space-y-0.5 text-left">
                                    <DialogTitle className="text-[17px] font-bold tracking-tight text-[#1A1A1A] sm:text-lg">
                                        QR Code{' '}
                                        {formatTableTitle(
                                            selectedQrTable.table_number,
                                        )}
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-[#6E6A64]">
                                        Cetak dan pasang kartu ini pada standee
                                        akrilik meja untuk pemesanan mandiri
                                        pelanggan.
                                    </DialogDescription>
                                </DialogHeader>
                            </div>

                            {/* Body 2 Kolom */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                                <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                    {/* KOLOM KIRI: Kartu Standee Meja Siap Cetak (Preview Fisik) */}
                                    <div className="flex w-full shrink-0 flex-col items-center justify-center rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-3.5 shadow-[0_2px_12px_rgba(26,26,26,0.03)] md:w-[300px] lg:w-[315px]">
                                        <div className="printable-qr relative flex w-full max-w-[17rem] flex-col items-center overflow-hidden rounded-[1.35rem] border-2 border-[#E2D4B5] bg-[#FFFDF9] shadow-md">
                                            {/* Header Brand Café SIDE LINE */}
                                            <div className="relative w-full overflow-hidden bg-gradient-to-br from-[#C52828] via-[#B71C1C] to-[#8E1414] px-4 pt-3.5 pb-4 text-center text-white">
                                                <div className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full bg-[#FBF1CB]/15 blur-lg" />
                                                <div className="pointer-events-none absolute -bottom-8 -left-8 size-20 rounded-full bg-black/15 blur-lg" />

                                                <div className="relative z-10 flex flex-col items-center">
                                                    <div className="mb-1.5 flex items-center gap-1.5 rounded-full border border-[#FBF1CB]/30 bg-white/10 px-2.5 py-0.5 backdrop-blur-xs">
                                                        <Coffee className="size-2.5 text-[#FBF1CB]" />
                                                        <span className="text-[8.5px] font-extrabold tracking-[0.2em] text-[#FBF1CB] uppercase">
                                                            Café & Roastery
                                                        </span>
                                                    </div>
                                                    <h3 className="font-heading text-xl leading-none font-black tracking-[0.14em] text-white uppercase">
                                                        SIDE LINE
                                                    </h3>
                                                </div>
                                            </div>

                                            {/* Badge Nomor Meja Melayang di Perbatasan Header */}
                                            <div className="relative z-20 -mt-3.5 flex flex-col items-center">
                                                <div className="inline-flex items-center gap-1.5 rounded-full border-2 border-[#FFFDF9] bg-[#FBF1CB] px-3.5 py-1 shadow-md">
                                                    <span className="size-2 rounded-full bg-[#C52828]" />
                                                    <span className="font-heading text-xs font-black tracking-[0.1em] text-[#3F2D1C] uppercase">
                                                        {formatTableBadge(
                                                            selectedQrTable.table_number,
                                                        )}
                                                    </span>
                                                    {selectedQrTable.name && (
                                                        <>
                                                            <span className="text-[#C8B58A]">
                                                                •
                                                            </span>
                                                            <span className="max-w-[6.5rem] truncate text-[9.5px] font-bold text-[#78716C]">
                                                                {
                                                                    selectedQrTable.name
                                                                }
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Area Utama Bingkai QR & Instruksi */}
                                            <div className="flex w-full flex-col items-center gap-3 px-4 pt-3 pb-3.5">
                                                {/* Bingkai QR Viewfinder Kamera */}
                                                <div className="relative mt-0.5 rounded-2xl border border-[#E8DFC8] bg-gradient-to-b from-white to-[#FAF6EC] p-3 shadow-sm">
                                                    {/* Label Pill Atas Bingkai */}
                                                    <div className="absolute -top-2 left-1/2 z-10 -translate-x-1/2">
                                                        <span className="inline-flex items-center gap-1 rounded-full bg-[#C52828] px-2 py-0.5 text-[8.5px] font-extrabold tracking-widest text-white uppercase shadow-xs">
                                                            <Camera className="size-2.5" />
                                                            Scan QR
                                                        </span>
                                                    </div>

                                                    {/* 4 Siku Viewfinder Kamera (#C52828) */}
                                                    <span className="pointer-events-none absolute top-1.5 left-1.5 size-4 rounded-tl-lg border-t-[3px] border-l-[3px] border-[#C52828]" />
                                                    <span className="pointer-events-none absolute top-1.5 right-1.5 size-4 rounded-tr-lg border-t-[3px] border-r-[3px] border-[#C52828]" />
                                                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 size-4 rounded-bl-lg border-b-[3px] border-l-[3px] border-[#C52828]" />
                                                    <span className="pointer-events-none absolute right-1.5 bottom-1.5 size-4 rounded-br-lg border-r-[3px] border-b-[3px] border-[#C52828]" />

                                                    {/* Gambar QR Code Presisi Tinggi */}
                                                    <div className="relative overflow-hidden rounded-xl border border-[#EFE5CF] bg-white p-1.5 shadow-2xs">
                                                        <img
                                                            src={getQrImage(
                                                                selectedQrTable.qr_token,
                                                                380,
                                                            )}
                                                            alt={`QR Code ${formatTableTitle(selectedQrTable.table_number)}`}
                                                            className="aspect-square size-36 object-contain"
                                                            loading="eager"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Teks Ajakan */}
                                                <div className="space-y-0.5 text-center">
                                                    <p className="font-heading text-sm font-black tracking-tight text-[#18181B]">
                                                        Scan untuk Lihat Menu
                                                    </p>
                                                    <p className="text-[10px] leading-snug font-medium text-[#78716C]">
                                                        Arahkan kamera
                                                        smartphone untuk memilih
                                                        menu favorit dari meja
                                                        ini
                                                    </p>
                                                </div>

                                                {/* 3 Langkah Visual */}
                                                <div className="grid w-full grid-cols-3 gap-1 rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] p-1.5 text-center">
                                                    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-[#FFFDF9] px-1 py-1 shadow-2xs">
                                                        <span className="text-[8.5px] font-black text-[#C52828]">
                                                            01
                                                        </span>
                                                        <span className="text-[9.5px] leading-tight font-bold text-[#18181B]">
                                                            Buka Kamera
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-[#FFFDF9] px-1 py-1 shadow-2xs">
                                                        <span className="text-[8.5px] font-black text-[#C52828]">
                                                            02
                                                        </span>
                                                        <span className="text-[9.5px] leading-tight font-bold text-[#18181B]">
                                                            Pilih Menu
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-0.5 rounded-lg bg-[#FFFDF9] px-1 py-1 shadow-2xs">
                                                        <span className="text-[8.5px] font-black text-[#C52828]">
                                                            03
                                                        </span>
                                                        <span className="text-[9.5px] leading-tight font-bold text-[#18181B]">
                                                            Siap Diantar
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer Kartu Standee */}
                                            <div className="flex w-full items-center justify-center gap-1.5 border-t border-[#E8DFC8] bg-[#FAF5E8] px-3 py-1.5 text-[8.5px] font-extrabold tracking-[0.16em] text-[#78716C] uppercase">
                                                <Sparkles className="size-2 text-[#C52828]" />
                                                <span>
                                                    SIDEORDER • DIGITAL MENU
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* KOLOM KANAN: Panel Informasi & Tautan ala Card QRIS */}
                                    <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                        <div className="space-y-3.5">
                                            {/* Dark Merchant / Table Banner ala QRIS */}
                                            <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black tracking-tight text-white">
                                                        QR
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold tracking-wide text-white">
                                                            SIDE LINE COFFEE •{' '}
                                                            {formatTableBadge(
                                                                selectedQrTable.table_number,
                                                            )}
                                                        </p>
                                                        <p className="text-[10px] text-white/60">
                                                            {selectedQrTable.name ||
                                                                'Area Utama Kafe'}{' '}
                                                            • Token Terenkripsi
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-[10px] font-medium text-white/60">
                                                        Total Order
                                                    </p>
                                                    <p className="text-sm font-black text-white tabular-nums">
                                                        {selectedQrTable.orders_count ??
                                                            0}
                                                        x
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Kotak Petunjuk Standee Akrilik */}
                                            <div className="space-y-2.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                                <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                    <span className="flex items-center gap-1.5">
                                                        <Sparkles className="size-3.5 text-[#C52828]" />
                                                        Spesifikasi Cetak
                                                        Standee
                                                    </span>
                                                    <span className="font-mono text-[10px] text-[#6E6A64]">
                                                        High Resolution (300
                                                        DPI)
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                    <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                        <span className="block text-[10px] text-[#6E6A64]">
                                                            Rekomendasi Akrilik
                                                        </span>
                                                        <strong className="font-bold text-[#1A1A1A]">
                                                            Ukuran A6 (10×15 cm)
                                                        </strong>
                                                    </div>
                                                    <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                                        <span className="block text-[10px] text-[#6E6A64]">
                                                            Dukungan Kamera
                                                        </span>
                                                        <strong className="font-bold text-[#1A1A1A]">
                                                            Semua Smartphone
                                                            (iOS / Android)
                                                        </strong>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Tautan URL Pemesanan Mandiri */}
                                            <div className="space-y-2 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                                <div className="flex items-center justify-between">
                                                    <Label className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                                        <Link2 className="size-3.5 text-[#C52828]" />
                                                        Tautan Pemesanan Mandiri
                                                    </Label>
                                                    <a
                                                        href={getOrderUrl(
                                                            selectedQrTable.qr_token,
                                                        )}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C52828] hover:underline"
                                                    >
                                                        <span>
                                                            Tes Buka Halaman
                                                        </span>
                                                        <ExternalLink className="size-3" />
                                                    </a>
                                                </div>

                                                <div className="flex items-center gap-2 rounded-xl border border-[#E6DFD3] bg-[#F3EFE6]/80 p-1.5 pl-3 transition-colors focus-within:border-[#C52828] focus-within:bg-white">
                                                    <input
                                                        ref={urlInputRef}
                                                        type="text"
                                                        readOnly
                                                        value={getOrderUrl(
                                                            selectedQrTable.qr_token,
                                                        )}
                                                        onClick={() =>
                                                            copyToClipboard(
                                                                getOrderUrl(
                                                                    selectedQrTable.qr_token,
                                                                ),
                                                            )
                                                        }
                                                        title="Klik untuk menyalin tautan"
                                                        className="min-w-0 flex-1 cursor-pointer truncate bg-transparent font-mono text-xs font-semibold text-[#1A1A1A] selection:bg-[#C52828]/20 focus:outline-hidden"
                                                    />
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() =>
                                                            copyToClipboard(
                                                                getOrderUrl(
                                                                    selectedQrTable.qr_token,
                                                                ),
                                                            )
                                                        }
                                                        className={cn(
                                                            'h-8 shrink-0 cursor-pointer gap-1.5 rounded-lg px-3 text-xs font-bold shadow-xs transition-all',
                                                            isCopied
                                                                ? 'border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700'
                                                                : 'border border-[#E6DFD3] bg-[#FFFDFB] text-[#1A1A1A] hover:bg-[#FAF8F4]',
                                                        )}
                                                    >
                                                        {isCopied ? (
                                                            <>
                                                                <Check className="size-3.5 text-white" />
                                                                <span>
                                                                    Tersalin!
                                                                </span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Copy className="size-3.5 text-[#6E6A64]" />
                                                                <span>
                                                                    Salin Link
                                                                </span>
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Sticky Footer Bar ala Card Modal QRIS */}
                            <div className="flex shrink-0 flex-col-reverse gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                        setRegeneratingTable(selectedQrTable)
                                    }
                                    className="h-10 cursor-pointer justify-center gap-1.5 rounded-xl text-xs font-bold text-[#B91C1C] hover:bg-[#FDECEB] hover:text-[#B91C1C] sm:justify-start"
                                >
                                    <RefreshCw className="size-3.5" /> Reset
                                    Token QR
                                </Button>

                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 flex-1 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6] sm:flex-none"
                                        onClick={() => setIsQrModalOpen(false)}
                                    >
                                        Tutup
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="h-11 flex-1 cursor-pointer gap-1.5 rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6] sm:flex-none"
                                        onClick={() =>
                                            handleDownloadTableQr(
                                                selectedQrTable,
                                            )
                                        }
                                        title="Unduh file gambar QR resolusi tinggi"
                                    >
                                        <Download className="size-3.5 text-[#C52828]" />
                                        <span>Unduh QR</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        onClick={handlePrint}
                                        className="h-11 flex-1 cursor-pointer gap-2 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222] sm:flex-none"
                                    >
                                        <Printer className="size-4" /> Cetak
                                        Kartu
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deletingTable}
                onOpenChange={(open) => !open && setDeletingTable(null)}
                title="Hapus meja?"
                description={
                    <>
                        <b className="text-foreground">
                            {deletingTable &&
                                formatTableTitle(deletingTable.table_number)}
                        </b>{' '}
                        akan dihapus dan QR Code-nya tidak bisa dipakai lagi.
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
                        Stiker QR lama untuk{' '}
                        <b className="text-foreground">
                            {regeneratingTable &&
                                formatTableTitle(
                                    regeneratingTable.table_number,
                                )}
                        </b>{' '}
                        tidak akan bisa dipakai lagi. Anda perlu mencetak ulang
                        kartu QR.
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
