import { Head, Link, router } from '@inertiajs/react';
import {
    Activity,
    AlertTriangle,
    Clock,
    Compass,
    CreditCard,
    History,
    LayoutGrid,
    LocateFixed,
    MapPin,
    Navigation,
    Phone,
    Radar,
    Receipt,
    RefreshCw,
    Save,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Store,
    Users,
    UtensilsCrossed,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    AdminPage,
    FieldError,
    FilterTabs,
    PageHeader,
    Panel,
    StatCard,
    StatGrid,
    StatusPill,
    ToggleField,
} from '@/components/admin/admin-ui';
import CafeLocationMap from '@/components/admin/cafe-location-map';
import { formatRupiah } from '@/components/admin/financial/financial-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type SystemTab = 'profile' | 'geofencing' | 'gateway' | 'system';

interface CafeSystemSetting {
    id: number;
    cafe_name: string;
    address: string | null;
    phone: string | null;
    receipt_footer: string | null;
    is_ordering_enabled: boolean;
    closed_message: string | null;
    allow_cash_payment: boolean;
    allow_xendit_payment: boolean;
    payment_expiry_minutes: number;
    min_payment_expiry_minutes: number;
    max_payment_expiry_minutes: number;
    is_location_restricted: boolean;
    latitude: number | null;
    longitude: number | null;
    access_radius_meters: number;
    min_radius_meters: number;
    max_radius_meters: number;
    is_enforcement_active: boolean;
    updated_at: string | null;
    updated_by_name: string | null;
}

interface GatewayConfigInfo {
    driver: string;
    label: string;
    is_configured: boolean;
    is_webhook_configured?: boolean;
    is_ready?: boolean;
    mode: string;
    supported_channels: string[];
    webhook_endpoint: string;
}

interface GatewayStats {
    paid_count: number;
    pending_count: number;
    failed_or_expired_count: number;
    xendit_paid_count: number;
}

interface RecentPaymentLog {
    id: number;
    payment_reference: string;
    order_number: string;
    customer_name: string;
    gateway: string;
    gateway_label: string;
    method: string;
    channel: string;
    type: string;
    amount: number;
    settled_amount: number;
    status: string;
    external_id: string | null;
    gateway_transaction_id: string | null;
    paid_at: string | null;
    created_at: string;
    actor_name: string;
}

interface SystemHealthInfo {
    active_tables: number;
    total_tables: number;
    active_menus: number;
    total_menus: number;
    menus_missing_cost: number;
    expired_stock_menus?: {
        id: number;
        name: string;
        stock_quantity: number;
        stock_valid_days: number;
        stock_updated_at_label?: string | null;
    }[];
    low_stock_menus: {
        id: number;
        name: string;
        stock_quantity: number;
        stock_valid_days?: number;
    }[];
    active_categories: number;
    total_categories: number;
    admin_users: number;
    cashier_users: number;
}

interface AuditLogEntry {
    id: string;
    type: string;
    order_number: string;
    customer_name: string;
    status: string;
    notes: string | null;
    actor_name: string;
    actor_role: string;
    created_at: string;
}

interface Props {
    initialTab?: SystemTab;
    setting: CafeSystemSetting;
    gatewayConfig?: GatewayConfigInfo;
    gatewayStats?: GatewayStats;
    recentPayments?: RecentPaymentLog[];
    systemHealth?: SystemHealthInfo;
    auditLogs?: AuditLogEntry[];
}

const RADIUS_PRESETS = [50, 100, 150, 250, 500, 1000];
const EXPIRY_PRESETS = [5, 10, 15, 30, 60];

function parseCoordinate(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

export default function LocationSettingsPage({
    initialTab = 'profile',
    setting,
    gatewayConfig,
    gatewayStats,
    recentPayments = [],
    systemHealth,
    auditLogs = [],
}: Props) {
    const [activeTab, setActiveTab] = useState<SystemTab>(initialTab);

    // State: Profil & Operasional QR
    const [cafeName, setCafeName] = useState(
        setting.cafe_name || 'Café SIDE LINE',
    );
    const [address, setAddress] = useState(setting.address || '');
    const [phone, setPhone] = useState(setting.phone || '');
    const [receiptFooter, setReceiptFooter] = useState(
        setting.receipt_footer ||
            'Terima kasih atas kunjungan Anda! Nikmati momen hangat di SIDE LINE.',
    );

    // State: Kebijakan Pembayaran & Gateway
    const [allowCashPayment, setAllowCashPayment] = useState<boolean>(
        setting.allow_cash_payment ?? true,
    );
    const [allowXenditPayment, setAllowXenditPayment] = useState<boolean>(
        setting.allow_xendit_payment ?? true,
    );
    const [expiryMinutesInput, setExpiryMinutesInput] = useState<string>(
        String(setting.payment_expiry_minutes ?? 15),
    );

    // State: Geofencing & Radius GPS
    const [isLocationRestricted, setIsLocationRestricted] = useState(
        setting.is_location_restricted,
    );
    const [latitudeInput, setLatitudeInput] = useState(
        setting.latitude !== null ? String(setting.latitude) : '',
    );
    const [longitudeInput, setLongitudeInput] = useState(
        setting.longitude !== null ? String(setting.longitude) : '',
    );
    const [radiusInput, setRadiusInput] = useState(
        String(setting.access_radius_meters || 100),
    );
    const [isDetectingGps, setIsDetectingGps] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isInsecureOrigin, setIsInsecureOrigin] = useState(false);

    useEffect(() => {
        setIsInsecureOrigin(!window.isSecureContext);
    }, []);

    const handleTabChange = (nextTab: SystemTab) => {
        setActiveTab(nextTab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', nextTab);
            window.history.replaceState({}, '', url.toString());
        }
    };

    const parsedLat = useMemo(
        () => parseCoordinate(latitudeInput),
        [latitudeInput],
    );
    const parsedLng = useMemo(
        () => parseCoordinate(longitudeInput),
        [longitudeInput],
    );
    const parsedRadius = useMemo(() => {
        const numeric = Number.parseInt(radiusInput, 10);
        if (Number.isNaN(numeric)) {
            return setting.access_radius_meters || 100;
        }
        return Math.min(
            setting.max_radius_meters,
            Math.max(setting.min_radius_meters, numeric),
        );
    }, [radiusInput, setting]);

    const handleMapLocationChange = (lat: number, lng: number) => {
        setLatitudeInput(lat.toFixed(6));
        setLongitudeInput(lng.toFixed(6));
        setErrors((prev) => {
            const next = { ...prev };
            delete next.latitude;
            delete next.longitude;
            return next;
        });
    };

    const handleDetectCurrentLocation = () => {
        if (typeof window !== 'undefined' && !window.isSecureContext) {
            toast.error(
                `Deteksi GPS browser diblokir di HTTP non-HTTPS (${window.location.origin}). Klik titik kafe langsung pada peta atau gunakan HTTPS.`,
            );
            return;
        }

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            toast.error(
                'Browser tidak mendukung Geolocation. Silakan klik titik kafe di peta.',
            );
            return;
        }

        setIsDetectingGps(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = Number(position.coords.latitude.toFixed(6));
                const lng = Number(position.coords.longitude.toFixed(6));
                setLatitudeInput(String(lat));
                setLongitudeInput(String(lng));
                setIsDetectingGps(false);
                toast.success(
                    `Lokasi GPS terdeteksi (akurasi ±${Math.round(position.coords.accuracy)} m).`,
                );
            },
            () => {
                setIsDetectingGps(false);
                toast.error(
                    'Gagal membaca sinyal GPS. Silakan klik lokasi kafe langsung di peta.',
                );
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const radiusNum = Number.parseInt(radiusInput, 10);
        const expiryNum = Number.parseInt(expiryMinutesInput, 10);

        if (
            isLocationRestricted &&
            (parsedLat === null || parsedLng === null)
        ) {
            toast.error(
                'Tentukan koordinat latitude dan longitude terlebih dahulu sebelum mengaktifkan pembatasan lokasi.',
            );
            handleTabChange('geofencing');
            return;
        }

        if (!allowCashPayment && !allowXenditPayment) {
            toast.error(
                'Minimal satu metode pembayaran (Tunai atau QRIS) harus diaktifkan.',
            );
            handleTabChange('gateway');
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        router.put(
            '/admin/location-settings',
            {
                cafe_name: cafeName.trim(),
                address: address.trim() || null,
                phone: phone.trim() || null,
                receipt_footer: receiptFooter.trim() || null,
                is_ordering_enabled: setting.is_ordering_enabled ?? true,
                closed_message: setting.closed_message || null,
                allow_cash_payment: allowCashPayment,
                allow_xendit_payment: allowXenditPayment,
                payment_expiry_minutes: Number.isNaN(expiryNum)
                    ? 15
                    : Math.min(
                          setting.max_payment_expiry_minutes ?? 120,
                          Math.max(
                              setting.min_payment_expiry_minutes ?? 5,
                              expiryNum,
                          ),
                      ),
                is_location_restricted: isLocationRestricted,
                latitude: parsedLat,
                longitude: parsedLng,
                access_radius_meters: Number.isNaN(radiusNum) ? 100 : radiusNum,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setIsSubmitting(false);
                    toast.success(
                        'Konfigurasi sistem Café SIDE LINE berhasil disimpan.',
                    );
                },
                onError: (err) => {
                    setIsSubmitting(false);
                    setErrors(err);
                    toast.error(
                        Object.values(err)[0] ||
                            'Gagal menyimpan konfigurasi sistem.',
                    );
                },
            },
        );
    };

    const hasCoordinates = parsedLat !== null && parsedLng !== null;
    const isGeofenceActive = isLocationRestricted && hasCoordinates;
    const formattedUpdatedAt = setting.updated_at
        ? new Date(setting.updated_at).toLocaleString('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : 'Belum pernah diperbarui';

    const saveButton = (label = 'Simpan Konfigurasi Sistem') => (
        <Button
            type="submit"
            disabled={isSubmitting}
            className="h-9 cursor-pointer gap-1.5 rounded-xl bg-[#C52828] px-4 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
        >
            <Save className="size-3.5" />
            <span>{isSubmitting ? 'Menyimpan...' : label}</span>
        </Button>
    );

    return (
        <>
            <Head title="Manajemen Sistem • Admin Café SIDE LINE" />

            <AdminPage>
                <PageHeader
                    icon={SlidersHorizontal}
                    title="Manajemen Sistem"
                    description={`Profil outlet, struk kasir, geofencing, gateway & audit • Update ${formattedUpdatedAt}`}
                    actions={
                        <>
                            {setting.is_ordering_enabled ? (
                                <StatusPill tone="success" icon={Store} dot>
                                    Outlet Aktif
                                </StatusPill>
                            ) : (
                                <StatusPill
                                    tone="danger"
                                    icon={ShieldAlert}
                                    dot
                                >
                                    QR Menu Nonaktif
                                </StatusPill>
                            )}
                            {isGeofenceActive ? (
                                <StatusPill
                                    tone="success"
                                    icon={ShieldCheck}
                                    dot
                                >
                                    Geofencing {parsedRadius} m
                                </StatusPill>
                            ) : (
                                <StatusPill tone="neutral" icon={MapPin}>
                                    Geofencing Nonaktif
                                </StatusPill>
                            )}
                        </>
                    }
                />

                <FilterTabs<SystemTab>
                    value={activeTab}
                    onChange={handleTabChange}
                    options={[
                        {
                            value: 'profile',
                            label: 'Profil Outlet & Struk',
                        },
                        {
                            value: 'geofencing',
                            label: 'Geofencing & Radius GPS',
                        },
                        {
                            value: 'gateway',
                            label: 'Payment Gateway & Kebijakan',
                            count: recentPayments.length,
                        },
                        {
                            value: 'system',
                            label: 'Kesehatan Sistem & Log Audit',
                            count: auditLogs.length,
                        },
                    ]}
                />

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* TAB 1: PROFIL OUTLET, FOOTER STRUK & PRATINJAU LANGSUNG */}
                    {activeTab === 'profile' && (
                        <div className="grid gap-6 lg:grid-cols-12">
                            <Panel className="flex flex-col justify-between space-y-4 p-5 lg:col-span-7">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 border-b border-[#EFE5CF] pb-3">
                                        <Store className="size-4 text-[#C52828]" />
                                        <div>
                                            <h2 className="text-sm font-extrabold text-[#18181B]">
                                                Identitas Outlet & Footer Struk
                                                Kasir
                                            </h2>
                                            <p className="text-[11px] text-[#78716C]">
                                                Ditampilkan pada halaman scan QR
                                                pelanggan, header nota kasir,
                                                dan gate lokasi.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid gap-3.5 sm:grid-cols-2">
                                        <div className="grid gap-1.5">
                                            <Label
                                                htmlFor="cafe_name"
                                                className="text-xs font-bold text-[#18181B]"
                                            >
                                                Nama Kafe / Outlet *
                                            </Label>
                                            <Input
                                                id="cafe_name"
                                                value={cafeName}
                                                onChange={(e) =>
                                                    setCafeName(e.target.value)
                                                }
                                                required
                                                className="h-10 rounded-xl border-[#DFCFA9] bg-[#FFFDF9] text-sm font-bold text-[#18181B]"
                                            />
                                            <FieldError
                                                message={errors.cafe_name}
                                            />
                                        </div>

                                        <div className="grid gap-1.5">
                                            <Label
                                                htmlFor="cafe_phone"
                                                className="text-xs font-bold text-[#18181B]"
                                            >
                                                Nomor Telepon / WhatsApp
                                            </Label>
                                            <div className="relative">
                                                <Phone className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#8C7A6B]" />
                                                <Input
                                                    id="cafe_phone"
                                                    value={phone}
                                                    onChange={(e) =>
                                                        setPhone(e.target.value)
                                                    }
                                                    placeholder="0812-xxxx-xxxx"
                                                    className="h-10 rounded-xl border-[#DFCFA9] bg-[#FFFDF9] pl-9 text-sm font-semibold text-[#18181B]"
                                                />
                                            </div>
                                            <FieldError
                                                message={errors.phone}
                                            />
                                        </div>
                                    </div>

                                    <div className="grid gap-1.5">
                                        <Label
                                            htmlFor="cafe_address"
                                            className="text-xs font-bold text-[#18181B]"
                                        >
                                            Alamat Lengkap Outlet
                                        </Label>
                                        <textarea
                                            id="cafe_address"
                                            rows={2}
                                            value={address}
                                            onChange={(e) =>
                                                setAddress(e.target.value)
                                            }
                                            placeholder="Alamat jalan, kota, patokan lokasi kafe..."
                                            className="w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] p-3 text-xs font-medium text-[#18181B] outline-none focus:border-[#C52828]"
                                        />
                                        <FieldError message={errors.address} />
                                    </div>

                                    <div className="grid gap-1.5">
                                        <Label
                                            htmlFor="receipt_footer"
                                            className="text-xs font-bold text-[#18181B]"
                                        >
                                            <Receipt className="mr-1 inline size-3.5 text-[#C52828]" />
                                            Teks Catatan / Footer Struk Kasir
                                        </Label>
                                        <textarea
                                            id="receipt_footer"
                                            rows={2}
                                            value={receiptFooter}
                                            onChange={(e) =>
                                                setReceiptFooter(e.target.value)
                                            }
                                            placeholder="Terima kasih telah berkunjung! Wi-Fi: SIDELINE_CAFE / Pass: kopi123"
                                            className="w-full rounded-xl border border-[#DFCFA9] bg-[#FFFDF9] p-3 text-xs font-medium text-[#18181B] outline-none focus:border-[#C52828]"
                                        />
                                        <FieldError
                                            message={errors.receipt_footer}
                                        />
                                    </div>
                                </div>

                                <div className="flex justify-end border-t border-[#EFE5CF] pt-4">
                                    {saveButton('Simpan Profil Outlet')}
                                </div>
                            </Panel>

                            <Panel className="flex flex-col justify-between space-y-4 p-5 lg:col-span-5">
                                <div className="space-y-3.5">
                                    <div className="flex items-center gap-2 border-b border-[#EFE5CF] pb-3">
                                        <Receipt className="size-4 text-[#C52828]" />
                                        <div>
                                            <h2 className="text-sm font-extrabold text-[#18181B]">
                                                Pratinjau Struk Kasir
                                            </h2>
                                            <p className="text-[11px] text-[#78716C]">
                                                Tampilan langsung identitas
                                                outlet dan catatan pada nota
                                                pelanggan.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-[#DFCFA9] bg-white p-4 text-[#18181B] shadow-xs">
                                        <div className="flex flex-col items-center border-b-2 border-dashed border-[#D6C7A3] pb-2.5 text-center">
                                            <div className="mb-1.5 flex size-8 items-center justify-center rounded-lg bg-[#C52828] text-xs font-black text-white">
                                                SL
                                            </div>
                                            <p className="text-xs font-black tracking-wider text-[#18181B] uppercase">
                                                {cafeName.trim() ||
                                                    'CAFÉ SIDE LINE'}
                                            </p>
                                            <p className="text-[9.5px] font-semibold tracking-wider text-[#78716C] uppercase">
                                                Coffee &amp; Eatery • Struk
                                                Resmi
                                            </p>
                                            <p className="mt-0.5 text-[10px] leading-snug text-[#57534E]">
                                                {address.trim() ||
                                                    'Alamat outlet belum diisi'}
                                            </p>
                                            <p className="text-[10px] text-[#57534E]">
                                                Telp: {phone.trim() || '-'}
                                            </p>
                                        </div>

                                        <div className="mt-2.5 flex items-center justify-between rounded-lg border border-[#EFE5CF] bg-[#FAF6EC] px-2.5 py-1.5 text-[10px]">
                                            <span className="font-mono font-bold text-[#18181B]">
                                                #SL-PREVIEW
                                            </span>
                                            <span className="rounded bg-[#18181B] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">
                                                MEJA 05
                                            </span>
                                        </div>

                                        <div className="mt-2 space-y-1 border-b border-dashed border-[#D6C7A3] pb-2 text-[10.5px]">
                                            <div className="flex justify-between">
                                                <span className="font-semibold">
                                                    1x Aren Oat Latte
                                                </span>
                                                <span className="font-mono font-bold tabular-nums">
                                                    Rp 28.000
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="font-semibold">
                                                    1x Butter Croissant
                                                </span>
                                                <span className="font-mono font-bold tabular-nums">
                                                    Rp 22.000
                                                </span>
                                            </div>
                                        </div>

                                        <div className="mt-2 flex items-center justify-between border-y border-[#18181B] py-1.5 text-[11px] font-black">
                                            <span>TOTAL BAYAR</span>
                                            <span className="font-mono text-[#C52828] tabular-nums">
                                                Rp 50.000
                                            </span>
                                        </div>

                                        <div className="mt-2 flex items-center justify-between rounded-lg border border-[#E8DFC8] bg-[#FAF6EC] px-2 py-1 text-[10px]">
                                            <span className="font-semibold text-[#57534E]">
                                                Metode:{' '}
                                                <strong className="text-[#18181B]">
                                                    QRIS
                                                </strong>
                                            </span>
                                            <span className="rounded bg-[#DCFCE7] px-1.5 py-0.5 text-[9px] font-black text-[#15803D]">
                                                LUNAS
                                            </span>
                                        </div>

                                        <p className="mt-2.5 border-t border-dashed border-[#D6C7A3] pt-2 text-center text-[10px] leading-snug font-bold text-[#18181B]">
                                            {receiptFooter.trim() ||
                                                'Terima kasih atas kunjungan Anda!'}
                                        </p>
                                    </div>
                                </div>

                                {systemHealth && (
                                    <div className="flex items-center justify-between rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/60 px-3.5 py-2.5 text-xs">
                                        <span className="font-bold text-[#5B4126]">
                                            Kesiapan Outlet Saat Ini
                                        </span>
                                        <span className="font-mono font-extrabold text-[#18181B]">
                                            {systemHealth.active_tables} meja •{' '}
                                            {systemHealth.active_menus} menu
                                        </span>
                                    </div>
                                )}
                            </Panel>
                        </div>
                    )}

                    {/* TAB 2: GEOFENCING & RADIUS GPS */}
                    {activeTab === 'geofencing' && (
                        <div className="space-y-5">
                            {isInsecureOrigin && isLocationRestricted && (
                                <div className="flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950 shadow-xs">
                                    <ShieldAlert className="mt-0.5 size-4.5 shrink-0 text-amber-700" />
                                    <div>
                                        <p className="font-bold">
                                            Situs Belum Menggunakan HTTPS
                                            (Geolocation Browser Akan Ditolak)
                                        </p>
                                        <p className="mt-0.5">
                                            Browser memblokir deteksi GPS pada
                                            alamat non-HTTPS kecuali localhost.
                                            Gunakan klik langsung pada peta atau
                                            aktifkan HTTPS.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <StatGrid>
                                <StatCard
                                    icon={
                                        isGeofenceActive
                                            ? ShieldCheck
                                            : ShieldAlert
                                    }
                                    tone={
                                        isGeofenceActive ? 'success' : 'warning'
                                    }
                                    label="Status Pembatasan"
                                    value={
                                        isGeofenceActive ? 'Aktif' : 'Nonaktif'
                                    }
                                    hint={
                                        isGeofenceActive
                                            ? 'Wajib di dalam radius'
                                            : 'Semua akses QR diizinkan'
                                    }
                                />
                                <StatCard
                                    icon={Radar}
                                    tone="brand"
                                    label="Radius Akses"
                                    value={`${parsedRadius} m`}
                                    hint={`Batas ${setting.min_radius_meters}–${setting.max_radius_meters} m`}
                                />
                                <StatCard
                                    icon={Compass}
                                    tone="neutral"
                                    label="Latitude"
                                    value={
                                        parsedLat !== null
                                            ? parsedLat.toFixed(5)
                                            : 'Belum'
                                    }
                                />
                                <StatCard
                                    icon={Navigation}
                                    tone="neutral"
                                    label="Longitude"
                                    value={
                                        parsedLng !== null
                                            ? parsedLng.toFixed(5)
                                            : 'Belum'
                                    }
                                />
                            </StatGrid>

                            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                                <div className="lg:col-span-7">
                                    <Panel className="p-4 sm:p-5">
                                        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <h2 className="flex items-center gap-2 text-base font-extrabold text-[#18181B]">
                                                    <MapPin className="size-4 text-[#C52828]" />
                                                    Peta Lokasi & Zona Jangkauan
                                                </h2>
                                                <p className="text-xs text-[#78716C]">
                                                    Klik peta untuk menentukan
                                                    titik pusat{' '}
                                                    <strong className="text-[#18181B]">
                                                        {cafeName}
                                                    </strong>
                                                    .
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={
                                                    handleDetectCurrentLocation
                                                }
                                                disabled={isDetectingGps}
                                                className="h-9 cursor-pointer gap-1.5 rounded-xl border-[#DFCFA9] bg-[#FAF6EC] px-3 text-xs font-bold text-[#5B4126]"
                                            >
                                                <LocateFixed
                                                    className={cn(
                                                        'size-3.5 text-[#C52828]',
                                                        isDetectingGps &&
                                                            'animate-spin',
                                                    )}
                                                />
                                                {isDetectingGps
                                                    ? 'Mendeteksi...'
                                                    : 'Deteksi Lokasi Saya'}
                                            </Button>
                                        </div>

                                        <CafeLocationMap
                                            latitude={parsedLat}
                                            longitude={parsedLng}
                                            radiusMeters={parsedRadius}
                                            cafeName={cafeName}
                                            onLocationChange={
                                                handleMapLocationChange
                                            }
                                        />
                                    </Panel>
                                </div>

                                <div className="lg:col-span-5">
                                    <Panel className="space-y-4 p-4 sm:p-5">
                                        <ToggleField
                                            id="is_location_restricted"
                                            checked={isLocationRestricted}
                                            onChange={setIsLocationRestricted}
                                            label="Aktifkan Pembatasan Radius GPS"
                                            description="Hanya pelanggan di dalam radius kafe yang bisa melihat katalog menu & checkout."
                                        />

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="grid gap-1.5">
                                                <Label
                                                    htmlFor="latitude"
                                                    className="text-xs font-bold text-[#18181B]"
                                                >
                                                    Latitude
                                                </Label>
                                                <Input
                                                    id="latitude"
                                                    type="number"
                                                    step="any"
                                                    value={latitudeInput}
                                                    onChange={(e) =>
                                                        setLatitudeInput(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="h-10 rounded-xl border-[#DFCFA9] bg-[#FFFDF9] font-mono text-xs font-bold"
                                                />
                                                <FieldError
                                                    message={errors.latitude}
                                                />
                                            </div>
                                            <div className="grid gap-1.5">
                                                <Label
                                                    htmlFor="longitude"
                                                    className="text-xs font-bold text-[#18181B]"
                                                >
                                                    Longitude
                                                </Label>
                                                <Input
                                                    id="longitude"
                                                    type="number"
                                                    step="any"
                                                    value={longitudeInput}
                                                    onChange={(e) =>
                                                        setLongitudeInput(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="h-10 rounded-xl border-[#DFCFA9] bg-[#FFFDF9] font-mono text-xs font-bold"
                                                />
                                                <FieldError
                                                    message={errors.longitude}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label
                                                    htmlFor="access_radius_meters"
                                                    className="text-xs font-bold text-[#18181B]"
                                                >
                                                    Radius Akses (Meter) *
                                                </Label>
                                                <span className="rounded-md bg-[#F5EEDC] px-2 py-0.5 font-mono text-[11px] font-bold text-[#5B4126]">
                                                    {parsedRadius} m
                                                </span>
                                            </div>
                                            <Input
                                                id="access_radius_meters"
                                                type="number"
                                                min={setting.min_radius_meters}
                                                max={setting.max_radius_meters}
                                                step={5}
                                                value={radiusInput}
                                                onChange={(e) =>
                                                    setRadiusInput(
                                                        e.target.value,
                                                    )
                                                }
                                                className="h-10 rounded-xl border-[#DFCFA9] bg-[#FFFDF9] font-mono text-sm font-bold"
                                            />
                                            <div className="flex flex-wrap gap-1.5">
                                                {RADIUS_PRESETS.map(
                                                    (preset) => (
                                                        <button
                                                            key={preset}
                                                            type="button"
                                                            onClick={() =>
                                                                setRadiusInput(
                                                                    String(
                                                                        preset,
                                                                    ),
                                                                )
                                                            }
                                                            className={cn(
                                                                'cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-bold',
                                                                Number.parseInt(
                                                                    radiusInput,
                                                                    10,
                                                                ) === preset
                                                                    ? 'border-[#C52828] bg-[#C52828] text-white'
                                                                    : 'border-[#E8DFC8] bg-[#FAF6EC] text-[#5B4126]',
                                                            )}
                                                        >
                                                            {preset >= 1000
                                                                ? `${preset / 1000} km`
                                                                : `${preset} m`}
                                                        </button>
                                                    ),
                                                )}
                                            </div>
                                        </div>

                                        <div className="border-t border-[#EFE5CF] pt-4">
                                            {saveButton(
                                                'Simpan Geofencing GPS',
                                            )}
                                        </div>
                                    </Panel>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: PAYMENT GATEWAY & KEBIJAKAN METODE PEMBAYARAN */}
                    {activeTab === 'gateway' && (
                        <div className="space-y-6">
                            <div className="grid gap-6 lg:grid-cols-12">
                                <Panel className="space-y-4 p-5 lg:col-span-6">
                                    <div className="flex items-center gap-2 border-b border-[#EFE5CF] pb-3">
                                        <CreditCard className="size-4 text-[#C52828]" />
                                        <div>
                                            <h2 className="text-sm font-extrabold text-[#18181B]">
                                                Kebijakan Metode & Batas Waktu
                                                Bayar
                                            </h2>
                                            <p className="text-[11px] text-[#78716C]">
                                                Diterapkan langsung pada halaman
                                                checkout pelanggan & inisiasi
                                                pembayaran.
                                            </p>
                                        </div>
                                    </div>

                                    <ToggleField
                                        id="allow_xendit_payment"
                                        checked={allowXenditPayment}
                                        onChange={setAllowXenditPayment}
                                        label="Izinkan Pembayaran Digital (QRIS)"
                                        description="Pelanggan dapat membayar langsung dari meja via QRIS dinamis."
                                    />

                                    <ToggleField
                                        id="allow_cash_payment"
                                        checked={allowCashPayment}
                                        onChange={setAllowCashPayment}
                                        label="Izinkan Pembayaran Tunai di Kasir"
                                        description="Pelanggan memesan lewat QR lalu membayar uang tunai ke kasir."
                                    />

                                    <FieldError
                                        message={errors.allow_cash_payment}
                                    />

                                    <div className="space-y-2 pt-1">
                                        <Label
                                            htmlFor="payment_expiry_minutes"
                                            className="flex items-center gap-1.5 text-xs font-bold text-[#18181B]"
                                        >
                                            <Clock className="size-3.5 text-[#C52828]" />
                                            Batas Kedaluwarsa QRIS / Invoice
                                            (Menit)
                                        </Label>
                                        <Input
                                            id="payment_expiry_minutes"
                                            type="number"
                                            min={
                                                setting.min_payment_expiry_minutes ??
                                                5
                                            }
                                            max={
                                                setting.max_payment_expiry_minutes ??
                                                120
                                            }
                                            value={expiryMinutesInput}
                                            onChange={(e) =>
                                                setExpiryMinutesInput(
                                                    e.target.value,
                                                )
                                            }
                                            className="h-10 rounded-xl border-[#DFCFA9] bg-[#FFFDF9] font-mono text-sm font-bold"
                                        />
                                        <div className="flex flex-wrap gap-1.5">
                                            {EXPIRY_PRESETS.map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() =>
                                                        setExpiryMinutesInput(
                                                            String(m),
                                                        )
                                                    }
                                                    className={cn(
                                                        'cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-bold',
                                                        Number.parseInt(
                                                            expiryMinutesInput,
                                                            10,
                                                        ) === m
                                                            ? 'border-[#C52828] bg-[#C52828] text-white'
                                                            : 'border-[#E8DFC8] bg-[#FAF6EC] text-[#5B4126]',
                                                    )}
                                                >
                                                    {m} menit
                                                </button>
                                            ))}
                                        </div>
                                        <FieldError
                                            message={
                                                errors.payment_expiry_minutes
                                            }
                                        />
                                    </div>

                                    <div className="flex justify-end border-t border-[#EFE5CF] pt-4">
                                        {saveButton(
                                            'Simpan Kebijakan Pembayaran',
                                        )}
                                    </div>
                                </Panel>

                                <Panel className="space-y-4 p-5 lg:col-span-6">
                                    <div className="flex items-center justify-between gap-2 border-b border-[#EFE5CF] pb-3">
                                        <div>
                                            <h2 className="text-sm font-extrabold text-[#18181B]">
                                                Koneksi Payment Gateway (
                                                {gatewayConfig?.label ??
                                                    'Pembayaran Digital'}
                                                )
                                            </h2>
                                            <p className="text-[11px] text-[#78716C]">
                                                Endpoint webhook:{' '}
                                                <code className="font-mono font-bold text-[#18181B]">
                                                    {gatewayConfig?.webhook_endpoint ??
                                                        '/payments/webhook'}
                                                </code>
                                            </p>
                                        </div>
                                        <StatusPill
                                            tone={
                                                (gatewayConfig?.is_ready ??
                                                gatewayConfig?.is_configured)
                                                    ? 'success'
                                                    : 'warning'
                                            }
                                        >
                                            {gatewayConfig?.mode ??
                                                'sandbox_slot'}
                                        </StatusPill>
                                    </div>

                                    {gatewayConfig?.driver === 'xendit' && (
                                        <div className="space-y-2 rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/70 p-3.5 text-xs">
                                            <p className="font-extrabold text-[#18181B]">
                                                Status Kredensial Xendit (.env
                                                Server)
                                            </p>
                                            <div className="flex flex-wrap gap-2">
                                                <StatusPill
                                                    tone={
                                                        gatewayConfig.is_configured
                                                            ? 'success'
                                                            : 'warning'
                                                    }
                                                >
                                                    API Secret Key:{' '}
                                                    {gatewayConfig.is_configured
                                                        ? 'Terisi'
                                                        : 'Belum Diisi'}
                                                </StatusPill>
                                                <StatusPill
                                                    tone={
                                                        gatewayConfig.is_webhook_configured
                                                            ? 'success'
                                                            : 'warning'
                                                    }
                                                >
                                                    Webhook Token:{' '}
                                                    {gatewayConfig.is_webhook_configured
                                                        ? 'Terisi'
                                                        : 'Belum Diisi'}
                                                </StatusPill>
                                            </div>
                                            {gatewayConfig.is_configured &&
                                                !gatewayConfig.is_webhook_configured && (
                                                    <p className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-900">
                                                        Perhatian:{' '}
                                                        <code className="font-mono font-bold">
                                                            XENDIT_WEBHOOK_TOKEN
                                                        </code>{' '}
                                                        belum diisi. Callback
                                                        otomatis dari Xendit
                                                        akan ditolak (HTTP 401)
                                                        sampai token diisi di
                                                        environment server.
                                                    </p>
                                                )}
                                        </div>
                                    )}

                                    {gatewayStats && (
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC] p-3">
                                                <p className="text-[10px] font-bold text-[#78716C] uppercase">
                                                    Pembayaran Lunas (All Time)
                                                </p>
                                                <p className="mt-1 font-mono text-lg font-black text-[#15803D]">
                                                    {gatewayStats.paid_count}{' '}
                                                    <span className="text-xs font-bold text-[#78716C]">
                                                        (
                                                        {
                                                            gatewayStats.xendit_paid_count
                                                        }{' '}
                                                        Digital)
                                                    </span>
                                                </p>
                                            </div>
                                            <div className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC] p-3">
                                                <p className="text-[10px] font-bold text-[#78716C] uppercase">
                                                    Pending / Gagal / Expired
                                                </p>
                                                <p className="mt-1 font-mono text-lg font-black text-[#B45309]">
                                                    {gatewayStats.pending_count}{' '}
                                                    pending •{' '}
                                                    <span className="text-[#B91C1C]">
                                                        {
                                                            gatewayStats.failed_or_expired_count
                                                        }{' '}
                                                        expired
                                                    </span>
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/70 p-3.5 text-xs text-[#5B4126]">
                                        <p className="font-extrabold text-[#18181B]">
                                            Channel Pembayaran Aktif:
                                        </p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {(
                                                gatewayConfig?.supported_channels ??
                                                []
                                            ).map((ch) => (
                                                <StatusPill
                                                    key={ch}
                                                    tone="neutral"
                                                >
                                                    {ch}
                                                </StatusPill>
                                            ))}
                                        </div>
                                    </div>
                                </Panel>
                            </div>

                            {/* Log Percobaan Payment Gateway Terbaru */}
                            <Panel className="p-5">
                                <h3 className="font-heading text-sm font-extrabold text-[#18181B]">
                                    25 Log Transaksi Payment Gateway Terbaru
                                </h3>
                                <div className="mt-3 overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead>
                                            <tr className="border-b border-[#E8DFC8] text-[10.5px] font-extrabold text-[#78716C] uppercase">
                                                <th className="py-2 pr-3">
                                                    Referensi & Order
                                                </th>
                                                <th className="px-2 py-2">
                                                    Gateway / Kanal
                                                </th>
                                                <th className="px-2 py-2 text-right">
                                                    Nominal
                                                </th>
                                                <th className="px-2 py-2">
                                                    Status
                                                </th>
                                                <th className="py-2 pl-2 text-right">
                                                    Waktu (WIB)
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#EFE5CF]">
                                            {recentPayments.map((p) => (
                                                <tr key={p.id}>
                                                    <td className="py-2 pr-3">
                                                        <p className="font-mono font-bold text-[#18181B]">
                                                            {
                                                                p.payment_reference
                                                            }
                                                        </p>
                                                        <p className="text-[10.5px] text-[#78716C]">
                                                            #{p.order_number} •{' '}
                                                            {p.customer_name}
                                                        </p>
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <p className="font-bold text-[#3F2D1C]">
                                                            {p.gateway_label}
                                                        </p>
                                                        <p className="text-[10.5px] text-[#78716C]">
                                                            {p.channel} •{' '}
                                                            {p.actor_name}
                                                        </p>
                                                    </td>
                                                    <td className="px-2 py-2 text-right font-mono font-bold">
                                                        {formatRupiah(p.amount)}
                                                    </td>
                                                    <td className="px-2 py-2">
                                                        <StatusPill
                                                            tone={
                                                                p.status ===
                                                                'paid'
                                                                    ? 'success'
                                                                    : p.status ===
                                                                        'pending'
                                                                      ? 'warning'
                                                                      : 'danger'
                                                            }
                                                        >
                                                            {p.status.toUpperCase()}
                                                        </StatusPill>
                                                    </td>
                                                    <td className="py-2 pl-2 text-right text-[11px] text-[#78716C]">
                                                        {p.paid_at ??
                                                            p.created_at}
                                                    </td>
                                                </tr>
                                            ))}
                                            {recentPayments.length === 0 && (
                                                <tr>
                                                    <td
                                                        colSpan={5}
                                                        className="py-6 text-center text-[#78716C]"
                                                    >
                                                        Belum ada log percobaan
                                                        pembayaran.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </Panel>
                        </div>
                    )}

                    {/* TAB 4: KESEHATAN SISTEM, INTEGRITAS MASTER DATA & LOG AUDIT */}
                    {activeTab === 'system' && systemHealth && (
                        <div className="space-y-6">
                            <StatGrid>
                                <StatCard
                                    icon={Store}
                                    tone={
                                        systemHealth.active_tables > 0
                                            ? 'brand'
                                            : 'danger'
                                    }
                                    label="Meja Aktif"
                                    value={`${systemHealth.active_tables}/${systemHealth.total_tables} Meja`}
                                    hint={
                                        systemHealth.total_tables -
                                            systemHealth.active_tables >
                                        0
                                            ? `${systemHealth.total_tables - systemHealth.active_tables} meja nonaktif`
                                            : 'Semua meja bisa menerima pesanan'
                                    }
                                />
                                <StatCard
                                    icon={UtensilsCrossed}
                                    tone={
                                        systemHealth.menus_missing_cost > 0
                                            ? 'warning'
                                            : 'success'
                                    }
                                    label="Menu Aktif"
                                    value={`${systemHealth.active_menus}/${systemHealth.total_menus} Menu`}
                                    hint={
                                        systemHealth.menus_missing_cost > 0
                                            ? `${systemHealth.menus_missing_cost} menu aktif belum ada HPP`
                                            : 'Semua menu aktif sudah ada HPP'
                                    }
                                />
                                <StatCard
                                    icon={LayoutGrid}
                                    tone={
                                        systemHealth.active_categories > 0
                                            ? 'success'
                                            : 'danger'
                                    }
                                    label="Kategori Aktif"
                                    value={`${systemHealth.active_categories}/${systemHealth.total_categories} Kategori`}
                                    hint={
                                        systemHealth.total_categories -
                                            systemHealth.active_categories >
                                        0
                                            ? `${systemHealth.total_categories - systemHealth.active_categories} kategori disembunyikan`
                                            : 'Semua kategori tampil ke pelanggan'
                                    }
                                />
                                <StatCard
                                    icon={Users}
                                    tone="neutral"
                                    label="Akun Pengguna"
                                    value={`${systemHealth.admin_users + systemHealth.cashier_users} Akun`}
                                    hint={`${systemHealth.admin_users} Admin • ${systemHealth.cashier_users} Kasir`}
                                />
                            </StatGrid>

                            <div className="grid gap-6 lg:grid-cols-12">
                                <Panel className="space-y-3 p-5 lg:col-span-5">
                                    <h3 className="flex items-center gap-2 font-heading text-sm font-extrabold text-[#18181B]">
                                        <Activity className="size-4 text-[#C52828]" />
                                        Integritas Data & Peringatan Stok
                                    </h3>

                                    {systemHealth.active_menus > 0 &&
                                    systemHealth.active_categories > 0 &&
                                    systemHealth.active_tables > 0 ? (
                                        <div className="rounded-xl border border-[#BBF7D0] bg-[#DCFCE7]/50 p-3.5 text-xs font-bold text-[#15803D]">
                                            Katalog siap operasional:{' '}
                                            {systemHealth.active_menus} menu
                                            aktif di{' '}
                                            {systemHealth.active_categories}{' '}
                                            kategori.
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3.5 text-xs font-bold text-[#991B1B]">
                                            Belum siap menerima pesanan:
                                            pastikan ada minimal 1 meja, 1
                                            kategori, dan 1 menu yang aktif.
                                        </div>
                                    )}

                                    {systemHealth.menus_missing_cost > 0 && (
                                        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3.5 text-xs font-bold text-[#92400E]">
                                            <span>
                                                {
                                                    systemHealth.menus_missing_cost
                                                }{' '}
                                                menu aktif belum diisi HPP
                                                (harga modal), laba di laporan
                                                jadi tidak akurat.
                                            </span>
                                            <Link
                                                href="/admin/menus"
                                                className="shrink-0 text-[11px] text-[#C52828] hover:underline"
                                            >
                                                Lengkapi
                                            </Link>
                                        </div>
                                    )}

                                    {(systemHealth.expired_stock_menus
                                        ?.length ?? 0) > 0 && (
                                        <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3.5 text-xs">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="flex items-center gap-1.5 font-extrabold text-[#991B1B]">
                                                    <AlertTriangle className="size-3.5 shrink-0 text-[#C52828]" />
                                                    <span>
                                                        Perlu Update Stok Hari
                                                        Ini (
                                                        {
                                                            systemHealth
                                                                .expired_stock_menus
                                                                ?.length
                                                        }{' '}
                                                        menu)
                                                    </span>
                                                </p>
                                                <Link
                                                    href="/admin/menus?filter=expired_stock"
                                                    className="inline-flex items-center gap-1 text-[11px] font-bold text-[#C52828] hover:underline"
                                                >
                                                    <RefreshCw className="size-3" />
                                                    Update
                                                </Link>
                                            </div>
                                            <ul className="mt-2 space-y-1">
                                                {systemHealth.expired_stock_menus?.map(
                                                    (m) => (
                                                        <li
                                                            key={m.id}
                                                            className="flex justify-between font-semibold text-[#7F1D1D]"
                                                        >
                                                            <span>
                                                                {m.name}
                                                            </span>
                                                            <span className="font-mono text-[11px] font-bold text-[#991B1B]">
                                                                Habis •{' '}
                                                                {
                                                                    m.stock_valid_days
                                                                }{' '}
                                                                hr
                                                            </span>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        </div>
                                    )}

                                    <div className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/60 p-3.5 text-xs">
                                        <p className="font-extrabold text-[#18181B]">
                                            Stok Terbatas Menipis (≤ 5 porsi)
                                        </p>
                                        {systemHealth.low_stock_menus.length ===
                                        0 ? (
                                            <p className="mt-1 text-[11px] text-[#78716C]">
                                                Tidak ada menu stok terbatas
                                                yang menipis.
                                            </p>
                                        ) : (
                                            <ul className="mt-2 space-y-1">
                                                {systemHealth.low_stock_menus.map(
                                                    (m) => (
                                                        <li
                                                            key={m.id}
                                                            className="flex justify-between font-semibold text-[#5B4126]"
                                                        >
                                                            <span>
                                                                {m.name}
                                                            </span>
                                                            <span className="font-mono font-bold text-[#B91C1C]">
                                                                Sisa{' '}
                                                                {
                                                                    m.stock_quantity
                                                                }
                                                            </span>
                                                        </li>
                                                    ),
                                                )}
                                            </ul>
                                        )}
                                    </div>
                                </Panel>

                                <Panel className="p-5 lg:col-span-7">
                                    <h3 className="flex items-center gap-2 font-heading text-sm font-extrabold text-[#18181B]">
                                        <History className="size-4 text-[#C52828]" />
                                        30 Log Audit Operasional & Penolakan
                                        Item Terbaru
                                    </h3>
                                    <div className="mt-3 max-h-[26rem] space-y-2 overflow-y-auto pr-1 text-xs">
                                        {auditLogs.map((log) => (
                                            <div
                                                key={log.id}
                                                className="rounded-xl border border-[#EFE5CF] bg-[#FAF6EC]/60 px-3.5 py-2.5"
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <StatusPill
                                                            tone={
                                                                log.type ===
                                                                'item_rejected'
                                                                    ? 'danger'
                                                                    : 'neutral'
                                                            }
                                                        >
                                                            {log.status}
                                                        </StatusPill>
                                                        <span className="font-mono font-bold text-[#18181B]">
                                                            #{log.order_number}
                                                        </span>
                                                        <span className="text-[#78716C]">
                                                            ({log.actor_name})
                                                        </span>
                                                    </div>
                                                    <span className="text-[10.5px] text-[#8C7A6B]">
                                                        {log.created_at}
                                                    </span>
                                                </div>
                                                {log.notes && (
                                                    <p className="mt-1 text-[11.5px] text-[#3F2D1C]">
                                                        {log.notes}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                        {auditLogs.length === 0 && (
                                            <p className="py-8 text-center text-[#78716C]">
                                                Belum ada log audit operasional.
                                            </p>
                                        )}
                                    </div>
                                </Panel>
                            </div>
                        </div>
                    )}
                </form>
            </AdminPage>
        </>
    );
}

LocationSettingsPage.layout = {
    breadcrumbs: [
        {
            title: 'Ringkasan',
            href: '/dashboard',
        },
        {
            title: 'Manajemen Sistem',
            href: '/admin/location-settings',
        },
    ],
};
