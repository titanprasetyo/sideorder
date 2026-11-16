import { Head, router, useForm } from '@inertiajs/react';
import {
    Check,
    Mail,
    Pencil,
    ShieldCheck,
    Sparkles,
    Trash2,
    UserCheck,
    UserPlus,
    Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
} from '@/components/admin/admin-ui';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface StaffUser {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'cashier';
    created_at: string;
}

interface Props {
    users: StaffUser[];
    currentUserId: number;
}

type RoleFilter = 'all' | 'admin' | 'cashier';

const roleOptions = [
    {
        value: 'cashier' as const,
        title: 'Kasir / Barista',
        description:
            'Akses papan pesanan & pembayaran (Role yang dapat ditambahkan)',
        icon: UserCheck,
    },
    {
        value: 'admin' as const,
        title: 'Administrator Tunggal',
        description: 'Akses penuh seluruh modul admin (Terkunci 1 akun owner)',
        icon: ShieldCheck,
    },
];

function RoleBadge({ role }: { role: StaffUser['role'] }) {
    return role === 'admin' ? (
        <StatusPill tone="brand" icon={ShieldCheck}>
            Administrator
        </StatusPill>
    ) : (
        <StatusPill tone="warning" icon={UserCheck}>
            Kasir / Barista
        </StatusPill>
    );
}

function Avatar({ user }: { user: StaffUser }) {
    return (
        <div
            className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-black uppercase shadow-xs ring-2 ring-white',
                user.role === 'admin'
                    ? 'bg-[#C52828] text-white'
                    : 'border border-[#DFCFA9] bg-[#F5EEDC] text-[#5B4126]',
            )}
        >
            {user.name.substring(0, 2)}
        </div>
    );
}

export default function StaffUsersIndex({ users, currentUserId }: Props) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
    const [deletingUser, setDeletingUser] = useState<StaffUser | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        if (
            urlParams.get('create') === 'true' ||
            urlParams.get('action') === 'create'
        ) {
            openCreateModal();
        }
    }, []);

    const form = useForm({
        name: '',
        email: '',
        password: '',
        role: 'cashier' as 'admin' | 'cashier',
    });

    const adminCount = users.filter((u) => u.role === 'admin').length;
    const cashierCount = users.filter((u) => u.role === 'cashier').length;

    const filteredUsers = useMemo(() => {
        const q = search.toLowerCase().trim();

        return users.filter((u) => {
            const matchRole = roleFilter === 'all' || u.role === roleFilter;
            const matchSearch =
                !q ||
                u.name.toLowerCase().includes(q) ||
                u.email.toLowerCase().includes(q);

            return matchRole && matchSearch;
        });
    }, [users, search, roleFilter]);

    const openCreateModal = () => {
        setEditingUser(null);
        form.setData({
            name: '',
            email: '',
            password: '',
            role: 'cashier',
        });
        form.clearErrors();
        setIsModalOpen(true);
    };

    const openEditModal = (user: StaffUser) => {
        setEditingUser(user);
        form.setData({
            name: user.name,
            email: user.email,
            password: '',
            role: user.role,
        });
        form.clearErrors();
        setIsModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingUser) {
            form.put(`/admin/users/${editingUser.id}`, {
                onSuccess: () => {
                    setIsModalOpen(false);
                    toast.success('Data akun staf berhasil diperbarui!');
                },
                onError: (err) =>
                    toast.error(Object.values(err)[0] || 'Gagal menyimpan.'),
            });
        } else {
            form.post('/admin/users', {
                onSuccess: () => {
                    setIsModalOpen(false);
                    form.reset();
                    toast.success('Akun kasir baru berhasil didaftarkan!');
                },
                onError: (err) =>
                    toast.error(Object.values(err)[0] || 'Gagal menyimpan.'),
            });
        }
    };

    const requestDelete = (user: StaffUser) => {
        if (user.id === currentUserId) {
            toast.error('Anda tidak dapat menghapus akun Anda sendiri.');
            return;
        }

        if (user.role === 'admin') {
            toast.error('Akun Administrator tunggal tidak dapat dihapus.');
            return;
        }

        setDeletingUser(user);
    };

    const confirmDelete = () => {
        if (!deletingUser) return;

        setIsDeleting(true);
        router.delete(`/admin/users/${deletingUser.id}`, {
            onSuccess: () => toast.success('Akun staf berhasil dihapus!'),
            onError: (err) =>
                toast.error(Object.values(err)[0] || 'Gagal menghapus akun.'),
            onFinish: () => {
                setIsDeleting(false);
                setDeletingUser(null);
            },
        });
    };

    const formatDate = (date: string) =>
        new Date(date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
        });

    return (
        <>
            <Head title="Manajemen Akun Staf Kafe" />

            <AdminPage>
                <PageHeader
                    icon={Users}
                    title="Kelola Kasir & Staf"
                    description="Daftarkan akun kasir baru dan kelola hak akses operasional SIDE LINE. Sistem menggunakan kebijakan 1 akun Administrator tunggal."
                    actions={
                        <Button
                            onClick={openCreateModal}
                            className="h-10 gap-2 rounded-xl bg-[#C52828] px-4 font-bold text-white shadow-sm hover:bg-[#A81E1E]"
                        >
                            <UserPlus className="size-4" />
                            Tambah Kasir
                        </Button>
                    }
                />

                <StatGrid>
                    <StatCard
                        icon={Users}
                        tone="neutral"
                        label="Total Akun"
                        value={users.length}
                        hint="1 Admin + Kasir aktif"
                    />
                    <StatCard
                        icon={ShieldCheck}
                        tone="brand"
                        label="Administrator"
                        value={adminCount}
                        hint="Akun owner tunggal"
                    />
                    <StatCard
                        icon={UserCheck}
                        tone="warning"
                        label="Kasir / Barista"
                        value={cashierCount}
                        hint="Akses papan pesanan"
                    />
                    <StatCard
                        icon={Mail}
                        tone="success"
                        label="Akun Anda"
                        value={
                            users
                                .find((u) => u.id === currentUserId)
                                ?.name.split(' ')[0] ?? '-'
                        }
                        hint="Sedang login"
                    />
                </StatGrid>

                <Panel>
                    {/* Toolbar */}
                    <div className="flex flex-col gap-3 border-b border-[#E8DFC8] bg-[#FAF5E8] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <FilterTabs<RoleFilter>
                            value={roleFilter}
                            onChange={setRoleFilter}
                            options={[
                                {
                                    value: 'all',
                                    label: 'Semua',
                                    count: users.length,
                                },
                                {
                                    value: 'admin',
                                    label: 'Admin',
                                    count: adminCount,
                                },
                                {
                                    value: 'cashier',
                                    label: 'Kasir',
                                    count: cashierCount,
                                },
                            ]}
                        />
                        <SearchInput
                            value={search}
                            onChange={setSearch}
                            placeholder="Cari nama atau email..."
                        />
                    </div>

                    {filteredUsers.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={
                                users.length === 0
                                    ? 'Belum ada akun staf'
                                    : 'Tidak ada staf yang cocok'
                            }
                            description={
                                users.length === 0
                                    ? 'Tambahkan akun kasir pertama agar tim bisa mulai menerima pesanan.'
                                    : 'Coba ubah kata kunci pencarian atau filter peran.'
                            }
                            action={
                                users.length === 0 && (
                                    <Button
                                        onClick={openCreateModal}
                                        className="gap-2 rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E]"
                                    >
                                        <UserPlus className="size-4" /> Tambah
                                        Kasir
                                    </Button>
                                )
                            }
                        />
                    ) : (
                        <>
                            {/* Desktop: tabel */}
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full min-w-[650px] text-left text-sm">
                                    <thead className="border-b border-[#E8DFC8] bg-[#F5EEDC] text-[11px] font-black tracking-wide text-[#78716C] uppercase">
                                        <tr>
                                            <th className="px-5 py-3.5">
                                                Staf
                                            </th>
                                            <th className="px-5 py-3.5">
                                                Peran
                                            </th>
                                            <th className="px-5 py-3.5">
                                                Terdaftar Sejak
                                            </th>
                                            <th className="px-5 py-3.5 text-right">
                                                Aksi
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E8DFC8] bg-[#FFFDF9]">
                                        {filteredUsers.map((user, index) => {
                                            const isSelf =
                                                user.id === currentUserId;
                                            const isLockedAdmin =
                                                user.role === 'admin';
                                            const cannotDelete =
                                                isSelf || isLockedAdmin;

                                            return (
                                                <tr
                                                    key={user.id}
                                                    className={`transition-colors ${
                                                        index % 2 === 0
                                                            ? 'bg-[#FFFDF9] hover:bg-[#F5EEDC]/60'
                                                            : 'bg-[#FAF6EC]/50 hover:bg-[#F5EEDC]/75'
                                                    }`}
                                                >
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar
                                                                user={user}
                                                            />
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="truncate font-extrabold text-[#18181B]">
                                                                        {
                                                                            user.name
                                                                        }
                                                                    </span>
                                                                    {isSelf && (
                                                                        <span className="rounded-md border border-[#DFCFA9] bg-[#F5EEDC] px-1.5 py-0.5 text-[10px] font-black text-[#5B4126]">
                                                                            Anda
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="truncate text-xs font-medium text-[#78716C]">
                                                                    {user.email}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <RoleBadge
                                                            role={user.role}
                                                        />
                                                    </td>
                                                    <td className="px-5 py-3.5 text-xs font-semibold text-[#78716C]">
                                                        {formatDate(
                                                            user.created_at,
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <IconAction
                                                                icon={Pencil}
                                                                label="Edit staf"
                                                                onClick={() =>
                                                                    openEditModal(
                                                                        user,
                                                                    )
                                                                }
                                                            />
                                                            <IconAction
                                                                icon={Trash2}
                                                                label={
                                                                    isSelf
                                                                        ? 'Tidak dapat menghapus akun sendiri'
                                                                        : isLockedAdmin
                                                                          ? 'Admin tunggal tidak dapat dihapus'
                                                                          : 'Hapus kasir'
                                                                }
                                                                variant="danger"
                                                                disabled={
                                                                    cannotDelete
                                                                }
                                                                onClick={() =>
                                                                    requestDelete(
                                                                        user,
                                                                    )
                                                                }
                                                            />
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Mobile: kartu */}
                            <div className="divide-y divide-[#E8DFC8] bg-[#FFFDF9] md:hidden">
                                {filteredUsers.map((user, index) => {
                                    const isSelf = user.id === currentUserId;
                                    const cannotDelete =
                                        isSelf || user.role === 'admin';

                                    return (
                                        <div
                                            key={user.id}
                                            className={`flex items-center gap-3 p-4 ${
                                                index % 2 === 0
                                                    ? 'bg-[#FFFDF9]'
                                                    : 'bg-[#FAF6EC]/40'
                                            }`}
                                        >
                                            <Avatar user={user} />
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-extrabold text-[#18181B]">
                                                        {user.name}
                                                    </span>
                                                    {isSelf && (
                                                        <span className="rounded-md border border-[#DFCFA9] bg-[#F5EEDC] px-1.5 py-0.5 text-[10px] font-black text-[#5B4126]">
                                                            Anda
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="truncate text-xs font-medium text-[#78716C]">
                                                    {user.email}
                                                </p>
                                                <RoleBadge role={user.role} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <IconAction
                                                    icon={Pencil}
                                                    label="Edit staf"
                                                    onClick={() =>
                                                        openEditModal(user)
                                                    }
                                                />
                                                {!cannotDelete && (
                                                    <IconAction
                                                        icon={Trash2}
                                                        label="Hapus kasir"
                                                        variant="danger"
                                                        onClick={() =>
                                                            requestDelete(user)
                                                        }
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </Panel>
            </AdminPage>

            {/* MODAL TAMBAH / EDIT STAF (Gaya 2 Kolom Standee QR Meja) */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="flex max-h-[92dvh] w-full max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl">
                    <form
                        onSubmit={handleSubmit}
                        className="flex max-h-[92dvh] flex-col"
                    >
                        {/* Sticky Header */}
                        <div className="shrink-0 border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pb-3.5">
                            <FormDialogHeader
                                icon={editingUser ? Pencil : UserPlus}
                                badge="Manajemen Akses Staf"
                                tag={
                                    form.data.role === 'admin'
                                        ? 'ADMINISTRATOR'
                                        : 'KASIR POS'
                                }
                                statusLabel="Aktif"
                                statusActive={true}
                                title={
                                    editingUser
                                        ? `Edit Staf: ${editingUser.name}`
                                        : 'Daftarkan Akun Kasir Baru'
                                }
                                description={
                                    editingUser
                                        ? 'Perbarui informasi akun login staf (kebijakan Admin tunggal menjaga role tetap terkunci).'
                                        : 'Buat akun login resmi untuk Kasir / Barista SIDE LINE. Sistem hanya mengizinkan satu akun Administrator.'
                                }
                            />
                        </div>

                        {/* Body 2 Kolom ala Modal QR Code Meja */}
                        <div className="flex-1 overflow-y-auto bg-[#FAF8F4] p-4 sm:p-5">
                            <div className="flex flex-col items-stretch gap-5 md:flex-row">
                                {/* KOLOM KIRI: Kartu Standee ID Staf */}
                                <StandeeModalCard
                                    pillPrimary={
                                        form.data.role === 'admin'
                                            ? 'ADMINISTRATOR'
                                            : 'KASIR POS'
                                    }
                                    pillSecondary="Resmi"
                                    topBadgeIcon={ShieldCheck}
                                    topBadgeLabel="ID CARD STAF"
                                    heading={
                                        form.data.name || 'Nama Staf SIDE LINE'
                                    }
                                    subheading={
                                        form.data.email || 'email@sideline.com'
                                    }
                                    steps={[
                                        {
                                            num: '01',
                                            label:
                                                form.data.role === 'admin'
                                                    ? 'Owner Tunggal'
                                                    : 'Akses Kasir',
                                        },
                                        { num: '02', label: 'Login Aman' },
                                        { num: '03', label: 'Siap Bertugas' },
                                    ]}
                                >
                                    <div className="flex size-36 flex-col items-center justify-center gap-2 bg-[#FAF5E8] p-3 text-center">
                                        <div className="flex size-16 items-center justify-center rounded-2xl bg-[#C52828] font-heading text-xl font-black text-white uppercase shadow-sm">
                                            {(form.data.name || 'SL').slice(
                                                0,
                                                2,
                                            )}
                                        </div>
                                        <span className="rounded-full border border-[#E8DFC8] bg-white px-2.5 py-0.5 text-[10px] font-extrabold tracking-wider text-[#18181B] uppercase shadow-2xs">
                                            {form.data.role === 'admin'
                                                ? 'Administrator'
                                                : 'Kasir Operasional'}
                                        </span>
                                    </div>
                                </StandeeModalCard>

                                {/* KOLOM KANAN: Panel Informasi & Form Staf */}
                                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3.5">
                                    <div className="space-y-3.5">
                                        {/* Dark Banner ala Card QRIS */}
                                        <div className="flex items-center justify-between rounded-xl bg-[#1A1A1A] p-3.5 text-white shadow-sm">
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black text-white uppercase">
                                                    {(
                                                        form.data.name || 'SL'
                                                    ).slice(0, 2)}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold tracking-wide text-white uppercase">
                                                        SIDE LINE COFFEE •{' '}
                                                        {form.data.name ||
                                                            'KASIR BARU'}
                                                    </p>
                                                    <p className="truncate text-[10px] text-white/60">
                                                        {form.data.email ||
                                                            'kasir@sideline.com'}{' '}
                                                        • Otentikasi Terenkripsi
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="shrink-0 text-right">
                                                <p className="text-[10px] font-medium text-white/60">
                                                    Hak Akses
                                                </p>
                                                <p className="text-xs font-black text-white uppercase">
                                                    {form.data.role === 'admin'
                                                        ? 'Admin'
                                                        : 'Kasir'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Kotak Identitas & Peran Staf */}
                                        <div className="space-y-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <Sparkles className="size-3.5 text-[#C52828]" />
                                                    Identitas & Peran Staf
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    Kebijakan Admin Tunggal
                                                </span>
                                            </div>

                                            <div className="grid gap-3">
                                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                                    <div className="grid gap-1.5">
                                                        <Label
                                                            htmlFor="staff_name"
                                                            className="text-xs font-bold text-[#1A1A1A]"
                                                        >
                                                            Nama Lengkap{' '}
                                                            <span className="text-[#C52828]">
                                                                *
                                                            </span>
                                                        </Label>
                                                        <Input
                                                            id="staff_name"
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
                                                            placeholder="Contoh: Budi Santoso"
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

                                                    <div className="grid gap-1.5">
                                                        <Label
                                                            htmlFor="staff_email"
                                                            className="text-xs font-bold text-[#1A1A1A]"
                                                        >
                                                            Email Login{' '}
                                                            <span className="text-[#C52828]">
                                                                *
                                                            </span>
                                                        </Label>
                                                        <Input
                                                            id="staff_email"
                                                            type="email"
                                                            value={
                                                                form.data.email
                                                            }
                                                            onChange={(e) =>
                                                                form.setData(
                                                                    'email',
                                                                    e.target
                                                                        .value,
                                                                )
                                                            }
                                                            placeholder="kasir@sideline.com"
                                                            className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-sm font-medium text-[#1A1A1A] placeholder:text-[#9E978E] focus:bg-white focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                            required
                                                        />
                                                        <FieldError
                                                            message={
                                                                form.errors
                                                                    .email
                                                            }
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid gap-1.5">
                                                    <Label className="text-xs font-bold text-[#1A1A1A]">
                                                        Peran / Hak Akses{' '}
                                                        <span className="text-[#C52828]">
                                                            *
                                                        </span>
                                                    </Label>
                                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                        {roleOptions.map(
                                                            (opt) => {
                                                                const active =
                                                                    form.data
                                                                        .role ===
                                                                    opt.value;
                                                                const disabled =
                                                                    editingUser
                                                                        ? opt.value !==
                                                                          editingUser.role
                                                                        : opt.value ===
                                                                          'admin';

                                                                return (
                                                                    <button
                                                                        key={
                                                                            opt.value
                                                                        }
                                                                        type="button"
                                                                        disabled={
                                                                            disabled
                                                                        }
                                                                        onClick={() => {
                                                                            if (
                                                                                !disabled
                                                                            ) {
                                                                                form.setData(
                                                                                    'role',
                                                                                    opt.value,
                                                                                );
                                                                            }
                                                                        }}
                                                                        className={cn(
                                                                            'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-all',
                                                                            disabled
                                                                                ? 'cursor-not-allowed border-[#EBE5DC] bg-[#F5F1E9]/60 opacity-50'
                                                                                : 'cursor-pointer',
                                                                            active
                                                                                ? 'border-[#C52828] bg-[#FFFDFB] shadow-2xs ring-2 ring-[#C52828]/15'
                                                                                : !disabled &&
                                                                                      'border-[#EBE5DC] bg-[#FAF8F4] hover:border-[#D6CFC2] hover:bg-[#FFFDFB]',
                                                                        )}
                                                                    >
                                                                        <div
                                                                            className={cn(
                                                                                'flex size-8 shrink-0 items-center justify-center rounded-lg shadow-2xs',
                                                                                active
                                                                                    ? 'bg-[#C52828] text-white'
                                                                                    : 'border border-[#E6DFD3] bg-[#FFFDFB] text-[#5B4126]',
                                                                            )}
                                                                        >
                                                                            <opt.icon className="size-4" />
                                                                        </div>
                                                                        <div>
                                                                            <p className="text-xs font-extrabold text-[#1A1A1A]">
                                                                                {
                                                                                    opt.title
                                                                                }
                                                                            </p>
                                                                            <p className="text-[10.5px] leading-snug font-medium text-[#6E6A64]">
                                                                                {
                                                                                    opt.description
                                                                                }
                                                                            </p>
                                                                        </div>
                                                                    </button>
                                                                );
                                                            },
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] font-medium text-[#78716C]">
                                                        Hanya 1 akun
                                                        Administrator yang
                                                        diizinkan. Penambahan
                                                        akun baru selalu
                                                        ditetapkan sebagai Kasir
                                                        POS.
                                                    </p>
                                                    <FieldError
                                                        message={
                                                            form.errors.role
                                                        }
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Kotak Keamanan Kata Sandi */}
                                        <div className="space-y-2.5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                                            <div className="flex items-center justify-between text-xs font-bold text-[#1A1A1A]">
                                                <span className="flex items-center gap-1.5">
                                                    <ShieldCheck className="size-3.5 text-[#C52828]" />
                                                    {editingUser
                                                        ? 'Ubah Kata Sandi (Opsional)'
                                                        : 'Kata Sandi Login'}
                                                </span>
                                                <span className="font-mono text-[10px] text-[#6E6A64]">
                                                    Min. 8 Karakter
                                                </span>
                                            </div>
                                            <div className="grid gap-1.5">
                                                <PasswordInput
                                                    id="staff_password"
                                                    value={form.data.password}
                                                    onChange={(e) =>
                                                        form.setData(
                                                            'password',
                                                            e.target.value,
                                                        )
                                                    }
                                                    placeholder={
                                                        editingUser
                                                            ? 'Kosongkan jika tidak ingin mengubah password'
                                                            : 'Masukkan password minimal 8 karakter'
                                                    }
                                                    className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-sm font-medium text-[#1A1A1A] focus:bg-white focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                                    required={!editingUser}
                                                    minLength={8}
                                                />
                                                <FieldError
                                                    message={
                                                        form.errors.password
                                                    }
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sticky Footer Action Bar ala Modal QR Code Meja */}
                        <div className="flex shrink-0 items-center justify-between gap-2.5 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5">
                            <span className="hidden text-xs font-semibold text-[#6E6A64] sm:inline">
                                Akun staf dapat digunakan langsung setelah
                                disimpan
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
                                        : editingUser
                                          ? 'Simpan Perubahan'
                                          : 'Daftarkan Staf'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deletingUser}
                onOpenChange={(open) => !open && setDeletingUser(null)}
                title="Hapus akun staf?"
                description={
                    <>
                        Akun{' '}
                        <b className="font-extrabold text-[#18181B]">
                            {deletingUser?.name}
                        </b>{' '}
                        akan dihapus permanen dan tidak bisa login lagi.
                    </>
                }
                onConfirm={confirmDelete}
                processing={isDeleting}
            />
        </>
    );
}

StaffUsersIndex.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: '/dashboard',
        },
        {
            title: 'Akun Staf',
            href: '/admin/users',
        },
    ],
};
