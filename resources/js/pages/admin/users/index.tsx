import { Head, router, useForm } from '@inertiajs/react';
import { Mail, Pencil, ShieldCheck, Trash2, UserCheck, UserPlus, Users } from 'lucide-react';
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
    StatCard,
    StatGrid,
    StatusPill,
} from '@/components/admin/admin-ui';
import PasswordInput from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
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
        description: 'Akses papan pesanan & pembayaran',
        icon: UserCheck,
    },
    {
        value: 'admin' as const,
        title: 'Administrator',
        description: 'Akses penuh semua modul admin',
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
                'flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-black uppercase ring-2 ring-white shadow-xs',
                user.role === 'admin' ? 'bg-[#C52828] text-white' : 'bg-[#F5EEDC] text-[#5B4126] border border-[#DFCFA9]',
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
        if (urlParams.get('create') === 'true' || urlParams.get('action') === 'create') {
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
            const matchSearch = !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);

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
                onError: (err) => toast.error(Object.values(err)[0] || 'Gagal menyimpan.'),
            });
        } else {
            form.post('/admin/users', {
                onSuccess: () => {
                    setIsModalOpen(false);
                    form.reset();
                    toast.success('Akun staf baru berhasil didaftarkan!');
                },
                onError: (err) => toast.error(Object.values(err)[0] || 'Gagal menyimpan.'),
            });
        }
    };

    const requestDelete = (user: StaffUser) => {
        if (user.id === currentUserId) {
            toast.error('Anda tidak dapat menghapus akun Anda sendiri.');
            return;
        }

        setDeletingUser(user);
    };

    const confirmDelete = () => {
        if (!deletingUser) return;

        setIsDeleting(true);
        router.delete(`/admin/users/${deletingUser.id}`, {
            onSuccess: () => toast.success('Akun staf berhasil dihapus!'),
            onError: (err) => toast.error(Object.values(err)[0] || 'Gagal menghapus akun.'),
            onFinish: () => {
                setIsDeleting(false);
                setDeletingUser(null);
            },
        });
    };

    const formatDate = (date: string) =>
        new Date(date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

    return (
        <>
            <Head title="Manajemen Akun Staf Kafe" />

            <AdminPage>
                <PageHeader
                    icon={Users}
                    title="Kelola Kasir & Staf"
                    description="Daftarkan akun kasir baru dan kelola hak akses tim operasional SIDE LINE."
                    actions={
                        <Button
                            onClick={openCreateModal}
                            className="h-10 gap-2 rounded-xl bg-[#C52828] px-4 font-bold text-white shadow-sm hover:bg-[#A81E1E]"
                        >
                            <UserPlus className="size-4" />
                            Tambah Staf
                        </Button>
                    }
                />

                <StatGrid>
                    <StatCard icon={Users} tone="neutral" label="Total Akun" value={users.length} hint="Semua staf terdaftar" />
                    <StatCard icon={ShieldCheck} tone="brand" label="Administrator" value={adminCount} hint="Akses penuh" />
                    <StatCard icon={UserCheck} tone="warning" label="Kasir / Barista" value={cashierCount} hint="Akses papan pesanan" />
                    <StatCard
                        icon={Mail}
                        tone="success"
                        label="Akun Anda"
                        value={users.find((u) => u.id === currentUserId)?.name.split(' ')[0] ?? '-'}
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
                                { value: 'all', label: 'Semua', count: users.length },
                                { value: 'admin', label: 'Admin', count: adminCount },
                                { value: 'cashier', label: 'Kasir', count: cashierCount },
                            ]}
                        />
                        <SearchInput value={search} onChange={setSearch} placeholder="Cari nama atau email..." />
                    </div>

                    {filteredUsers.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={users.length === 0 ? 'Belum ada akun staf' : 'Tidak ada staf yang cocok'}
                            description={
                                users.length === 0
                                    ? 'Tambahkan akun kasir pertama agar tim bisa mulai menerima pesanan.'
                                    : 'Coba ubah kata kunci pencarian atau filter peran.'
                            }
                            action={
                                users.length === 0 && (
                                    <Button onClick={openCreateModal} className="gap-2 rounded-xl bg-[#C52828] font-bold text-white hover:bg-[#A81E1E]">
                                        <UserPlus className="size-4" /> Tambah Staf
                                    </Button>
                                )
                            }
                        />
                    ) : (
                        <>
                            {/* Desktop: tabel */}
                            <div className="hidden overflow-x-auto md:block">
                                <table className="w-full text-left text-sm">
                                    <thead className="border-b border-[#E8DFC8] bg-[#F5EEDC] text-[11px] font-black tracking-wide text-[#78716C] uppercase">
                                        <tr>
                                            <th className="px-5 py-3.5">Staf</th>
                                            <th className="px-5 py-3.5">Peran</th>
                                            <th className="px-5 py-3.5">Terdaftar Sejak</th>
                                            <th className="px-5 py-3.5 text-right">Aksi</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#E8DFC8] bg-[#FFFDF9]">
                                        {filteredUsers.map((user, index) => {
                                            const isSelf = user.id === currentUserId;

                                            return (
                                                <tr
                                                    key={user.id}
                                                    className={`transition-colors ${
                                                        index % 2 === 0 ? 'bg-[#FFFDF9] hover:bg-[#F5EEDC]/60' : 'bg-[#FAF6EC]/50 hover:bg-[#F5EEDC]/75'
                                                    }`}
                                                >
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center gap-3">
                                                            <Avatar user={user} />
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="truncate font-extrabold text-[#18181B]">{user.name}</span>
                                                                    {isSelf && (
                                                                        <span className="rounded-md border border-[#DFCFA9] bg-[#F5EEDC] px-1.5 py-0.5 text-[10px] font-black text-[#5B4126]">
                                                                            Anda
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <p className="truncate text-xs font-medium text-[#78716C]">{user.email}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <RoleBadge role={user.role} />
                                                    </td>
                                                    <td className="px-5 py-3.5 text-xs font-semibold text-[#78716C]">
                                                        {formatDate(user.created_at)}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <IconAction icon={Pencil} label="Edit staf" onClick={() => openEditModal(user)} />
                                                            <IconAction
                                                                icon={Trash2}
                                                                label={isSelf ? 'Tidak dapat menghapus akun sendiri' : 'Hapus staf'}
                                                                variant="danger"
                                                                disabled={isSelf}
                                                                onClick={() => requestDelete(user)}
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

                                    return (
                                        <div
                                            key={user.id}
                                            className={`flex items-center gap-3 p-4 ${
                                                index % 2 === 0 ? 'bg-[#FFFDF9]' : 'bg-[#FAF6EC]/40'
                                            }`}
                                        >
                                            <Avatar user={user} />
                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-extrabold text-[#18181B]">{user.name}</span>
                                                    {isSelf && (
                                                        <span className="rounded-md border border-[#DFCFA9] bg-[#F5EEDC] px-1.5 py-0.5 text-[10px] font-black text-[#5B4126]">
                                                            Anda
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="truncate text-xs font-medium text-[#78716C]">{user.email}</p>
                                                <RoleBadge role={user.role} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <IconAction icon={Pencil} label="Edit staf" onClick={() => openEditModal(user)} />
                                                {!isSelf && (
                                                    <IconAction icon={Trash2} label="Hapus staf" variant="danger" onClick={() => requestDelete(user)} />
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

            {/* MODAL TAMBAH / EDIT STAF */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent className="rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] sm:max-w-lg">
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <FormDialogHeader
                            icon={editingUser ? Pencil : UserPlus}
                            title={editingUser ? `Edit Staf: ${editingUser.name}` : 'Daftarkan Akun Staf Baru'}
                            description={
                                editingUser
                                    ? 'Perbarui informasi akun atau ubah peran staf.'
                                    : 'Buat akun login baru untuk kasir atau administrator kafe.'
                            }
                        />

                        <div className="grid gap-4">
                            <div className="grid gap-1.5">
                                <Label htmlFor="staff_name" className="text-xs font-bold text-[#18181B]">
                                    Nama Lengkap <span className="text-[#C52828]">*</span>
                                </Label>
                                <Input
                                    id="staff_name"
                                    value={form.data.name}
                                    onChange={(e) => form.setData('name', e.target.value)}
                                    placeholder="Contoh: Budi Santoso"
                                    className="h-10 rounded-xl border-[#DFCFA9] bg-white text-sm font-medium text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                    required
                                    autoFocus
                                />
                                <FieldError message={form.errors.name} />
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="staff_email" className="text-xs font-bold text-[#18181B]">
                                    Email Login <span className="text-[#C52828]">*</span>
                                </Label>
                                <Input
                                    id="staff_email"
                                    type="email"
                                    value={form.data.email}
                                    onChange={(e) => form.setData('email', e.target.value)}
                                    placeholder="kasir@sideline.com"
                                    className="h-10 rounded-xl border-[#DFCFA9] bg-white text-sm font-medium text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                    required
                                />
                                <FieldError message={form.errors.email} />
                            </div>

                            {/* Pilihan Role (kartu) */}
                            <div className="grid gap-1.5">
                                <Label className="text-xs font-bold text-[#18181B]">
                                    Peran / Hak Akses <span className="text-[#C52828]">*</span>
                                </Label>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {roleOptions.map((opt) => {
                                        const active = form.data.role === opt.value;

                                        return (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                onClick={() => form.setData('role', opt.value)}
                                                className={cn(
                                                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all',
                                                    active
                                                        ? 'border-[#C52828] bg-[#FDECEC]/60 ring-2 ring-[#C52828]/15'
                                                        : 'border-[#E8DFC8] bg-white hover:border-[#DFCFA9] hover:bg-[#FAF5E8]',
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        'flex size-8 shrink-0 items-center justify-center rounded-lg shadow-2xs',
                                                        active ? 'bg-[#C52828] text-white' : 'border border-[#DFCFA9] bg-[#F5EEDC] text-[#5B4126]',
                                                    )}
                                                >
                                                    <opt.icon className="size-4" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-extrabold text-[#18181B]">{opt.title}</p>
                                                    <p className="text-[11px] font-medium leading-snug text-[#78716C]">{opt.description}</p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                <FieldError message={form.errors.role} />
                            </div>

                            <div className="grid gap-1.5">
                                <Label htmlFor="staff_password" className="text-xs font-bold text-[#18181B]">
                                    {editingUser ? 'Password Baru' : 'Password Login'}{' '}
                                    {!editingUser && <span className="text-[#C52828]">*</span>}
                                </Label>
                                <PasswordInput
                                    id="staff_password"
                                    value={form.data.password}
                                    onChange={(e) => form.setData('password', e.target.value)}
                                    placeholder={editingUser ? 'Kosongkan jika tidak diubah' : 'Minimal 8 karakter'}
                                    className="h-10 rounded-xl border-[#DFCFA9] bg-white text-sm font-medium text-[#18181B] focus-visible:border-[#C52828] focus-visible:ring-[#C52828]/20"
                                    required={!editingUser}
                                    minLength={8}
                                />
                                <FieldError message={form.errors.password} />
                            </div>
                        </div>

                        <DialogFooter className="gap-2 border-t border-[#E8DFC8] pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                className="rounded-xl border-[#DFCFA9] bg-white font-semibold text-[#18181B] hover:bg-[#FAF5E8]"
                                onClick={() => setIsModalOpen(false)}
                                disabled={form.processing}
                            >
                                Batal
                            </Button>
                            <Button
                                type="submit"
                                disabled={form.processing}
                                className="rounded-xl bg-[#C52828] font-bold text-white shadow-sm hover:bg-[#A81E1E]"
                            >
                                {form.processing ? 'Menyimpan...' : editingUser ? 'Simpan Perubahan' : 'Daftarkan Staf'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deletingUser}
                onOpenChange={(open) => !open && setDeletingUser(null)}
                title="Hapus akun staf?"
                description={
                    <>
                        Akun <b className="font-extrabold text-[#18181B]">{deletingUser?.name}</b> akan dihapus permanen dan tidak bisa login lagi.
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
