import { Head, router } from '@inertiajs/react';
import {
    CheckCircle2,
    Compass,
    LocateFixed,
    MapPin,
    Navigation,
    Radar,
    Save,
    ShieldAlert,
    ShieldCheck,
    SlidersHorizontal,
    Sparkles,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    AdminPage,
    FieldError,
    PageHeader,
    Panel,
    StatCard,
    StatGrid,
    StatusPill,
    ToggleField,
} from '@/components/admin/admin-ui';
import CafeLocationMap from '@/components/admin/cafe-location-map';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface CafeLocationSetting {
    id: number;
    cafe_name: string;
    address: string | null;
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

interface Props {
    setting: CafeLocationSetting;
}

const RADIUS_PRESETS = [50, 100, 150, 250, 500, 1000];

function parseCoordinate(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

export default function LocationSettingsPage({ setting }: Props) {
    const [cafeName, setCafeName] = useState(
        setting.cafe_name || 'Café SIDE LINE',
    );
    const [address, setAddress] = useState(setting.address || '');
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
                `Deteksi GPS browser diblokir di alamat HTTP non-aman (${window.location.origin}). Aktifkan HTTPS (misal: herd secure) atau klik titik lokasi kafe langsung pada peta.`,
            );
            return;
        }

        if (typeof navigator === 'undefined' || !navigator.geolocation) {
            toast.error(
                'Browser tidak mendukung fitur Geolocation/GPS. Silakan klik titik di peta atau masukkan koordinat secara manual.',
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
                setErrors((prev) => {
                    const next = { ...prev };
                    delete next.latitude;
                    delete next.longitude;
                    return next;
                });
                setIsDetectingGps(false);
                toast.success(
                    `Lokasi GPS terdeteksi (akurasi ±${Math.round(position.coords.accuracy)} m).`,
                );
            },
            (err) => {
                setIsDetectingGps(false);
                if (
                    err.code === err.PERMISSION_DENIED &&
                    err.message.toLowerCase().includes('secure')
                ) {
                    toast.error(
                        'Browser memblokir GPS karena halaman belum HTTPS. Aktifkan SSL/HTTPS (herd secure) atau klik titik langsung pada peta.',
                    );
                } else if (err.code === err.PERMISSION_DENIED) {
                    toast.error(
                        'Izin akses lokasi ditolak browser. Aktifkan izin lokasi atau pilih titik langsung pada peta.',
                    );
                } else if (err.code === err.TIMEOUT) {
                    toast.error(
                        'Waktu deteksi GPS habis. Coba lagi atau klik titik kafe langsung di peta.',
                    );
                } else {
                    toast.error(
                        'Sinyal GPS tidak tersedia saat ini. Silakan klik titik lokasi kafe langsung pada peta.',
                    );
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 12000,
                maximumAge: 0,
            },
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        const radiusNum = Number.parseInt(radiusInput, 10);
        if (
            isLocationRestricted &&
            (parsedLat === null || parsedLng === null)
        ) {
            toast.error(
                'Tentukan koordinat latitude dan longitude kafe terlebih dahulu sebelum mengaktifkan pembatasan lokasi.',
            );
            return;
        }

        setIsSubmitting(true);
        setErrors({});

        router.put(
            '/admin/location-settings',
            {
                cafe_name: cafeName.trim(),
                address: address.trim() || null,
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
                        'Pengaturan lokasi & radius akses kafe berhasil disimpan.',
                    );
                },
                onError: (err) => {
                    setIsSubmitting(false);
                    setErrors(err);
                    toast.error(
                        Object.values(err)[0] ||
                            'Gagal menyimpan pengaturan lokasi kafe.',
                    );
                },
            },
        );
    };

    const hasCoordinates = parsedLat !== null && parsedLng !== null;
    const isCurrentlyActive = isLocationRestricted && hasCoordinates;
    const formattedUpdatedAt = setting.updated_at
        ? new Date(setting.updated_at).toLocaleString('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : 'Belum pernah diperbarui';

    return (
        <>
            <Head title="Lokasi & Radius Kafe" />

            <AdminPage>
                <PageHeader
                    icon={MapPin}
                    title="Lokasi & Radius Akses Kafe"
                    description="Tentukan titik koordinat Café SIDE LINE dan batas radius GPS pelanggan yang diizinkan membuka halaman pemesanan."
                    actions={
                        <div className="flex items-center gap-2">
                            {isCurrentlyActive ? (
                                <StatusPill
                                    tone="success"
                                    icon={ShieldCheck}
                                    dot
                                >
                                    Pembatasan Aktif • {parsedRadius} m
                                </StatusPill>
                            ) : (
                                <StatusPill tone="warning" icon={ShieldAlert}>
                                    Pembatasan Nonaktif
                                </StatusPill>
                            )}
                        </div>
                    }
                />

                {isInsecureOrigin && isLocationRestricted && (
                    <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs leading-relaxed text-amber-950 shadow-xs">
                        <ShieldAlert className="mt-0.5 size-4.5 shrink-0 text-amber-700" />
                        <div>
                            <p className="font-bold text-amber-950">
                                Situs Belum Menggunakan HTTPS (Geolocation GPS
                                Akan Ditolak Browser)
                            </p>
                            <p className="mt-1 text-amber-900">
                                Halaman ini diakses melalui HTTP non-HTTPS (
                                <code>Not secure</code>). Browser Chrome, Edge,
                                dan HP pelanggan memblokir akses GPS kecuali
                                dibuka melalui <strong>HTTPS</strong> atau{' '}
                                <code>localhost</code>. Untuk pengembangan lokal
                                di Laravel Herd, aktifkan SSL dengan menjalankan{' '}
                                <code className="rounded bg-amber-100 px-1 py-0.5 font-semibold">
                                    herd secure
                                </code>{' '}
                                atau klik ikon gembok situs di Herd, lalu buka{' '}
                                <strong>https://sideorder.test</strong>.
                            </p>
                        </div>
                    </div>
                )}

                <StatGrid>
                    <StatCard
                        icon={isCurrentlyActive ? ShieldCheck : ShieldAlert}
                        tone={isCurrentlyActive ? 'success' : 'warning'}
                        label="Status Pembatasan"
                        value={isCurrentlyActive ? 'Aktif' : 'Nonaktif'}
                        hint={
                            isCurrentlyActive
                                ? 'Pelanggan wajib di dalam radius'
                                : 'Semua akses QR diizinkan'
                        }
                    />
                    <StatCard
                        icon={Radar}
                        tone="brand"
                        label="Radius Akses"
                        value={`${parsedRadius} m`}
                        hint={`Batas ${setting.min_radius_meters}–${setting.max_radius_meters} meter`}
                    />
                    <StatCard
                        icon={Compass}
                        tone="neutral"
                        label="Latitude"
                        value={
                            parsedLat !== null ? parsedLat.toFixed(5) : 'Belum'
                        }
                        hint="Koordinat lintang kafe"
                    />
                    <StatCard
                        icon={Navigation}
                        tone="neutral"
                        label="Longitude"
                        value={
                            parsedLng !== null ? parsedLng.toFixed(5) : 'Belum'
                        }
                        hint="Koordinat bujur kafe"
                    />
                </StatGrid>

                <form
                    onSubmit={handleSubmit}
                    className="grid grid-cols-1 gap-6 lg:grid-cols-12"
                >
                    {/* Kolom Kiri: Peta Interaktif Leaflet + Visualisasi Radius */}
                    <div className="space-y-4 lg:col-span-7">
                        <Panel className="p-4 sm:p-5">
                            <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <h2 className="flex items-center gap-2 text-base font-extrabold text-[#18181B]">
                                        <MapPin className="size-4 text-[#C52828]" />
                                        Peta Lokasi & Zona Jangkauan
                                    </h2>
                                    <p className="text-xs text-[#78716C]">
                                        Lingkaran merah menunjukkan area GPS
                                        yang dapat memesan menu di{' '}
                                        <span className="font-bold text-[#18181B]">
                                            {cafeName || 'Café SIDE LINE'}
                                        </span>
                                        .
                                    </p>
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleDetectCurrentLocation}
                                    disabled={isDetectingGps}
                                    className="h-9 cursor-pointer gap-1.5 rounded-xl border-[#DFCFA9] bg-[#FAF6EC] px-3 text-xs font-bold text-[#5B4126] hover:bg-[#F5EEDC] hover:text-[#18181B]"
                                >
                                    <LocateFixed
                                        className={cn(
                                            'size-3.5 text-[#C52828]',
                                            isDetectingGps && 'animate-spin',
                                        )}
                                    />
                                    {isDetectingGps
                                        ? 'Mendeteksi GPS...'
                                        : 'Gunakan Lokasi Saya Saat Ini'}
                                </Button>
                            </div>

                            <CafeLocationMap
                                latitude={parsedLat}
                                longitude={parsedLng}
                                radiusMeters={parsedRadius}
                                cafeName={cafeName}
                                onLocationChange={handleMapLocationChange}
                            />

                            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E8DFC8] bg-[#FAF6EC] px-3.5 py-2.5 text-xs text-[#5B4126]">
                                <span className="flex items-center gap-2 font-medium">
                                    <Sparkles className="size-3.5 shrink-0 text-[#C52828]" />
                                    Panel Admin & Kasir tidak terpengaruh
                                    pembatasan radius ini.
                                </span>
                                <span className="text-[11px] font-semibold text-[#78716C]">
                                    Update terakhir: {formattedUpdatedAt}
                                    {setting.updated_by_name
                                        ? ` • ${setting.updated_by_name}`
                                        : ''}
                                </span>
                            </div>
                        </Panel>
                    </div>

                    {/* Kolom Kanan: Form Koordinat, Radius & Aktivasi */}
                    <div className="space-y-4 lg:col-span-5">
                        <Panel className="space-y-4 p-4 sm:p-5">
                            <div className="flex items-center gap-2 border-b border-[#EFE5CF] pb-3">
                                <div className="flex size-8 items-center justify-center rounded-xl bg-[#FDECEC] text-[#C52828]">
                                    <SlidersHorizontal className="size-4" />
                                </div>
                                <div>
                                    <h2 className="text-sm font-extrabold text-[#18181B]">
                                        Konfigurasi Geofencing Kafe
                                    </h2>
                                    <p className="text-[11px] text-[#78716C]">
                                        Atur koordinat pusat kafe dan jarak
                                        maksimal dalam meter.
                                    </p>
                                </div>
                            </div>

                            <ToggleField
                                id="is_location_restricted"
                                checked={isLocationRestricted}
                                onChange={setIsLocationRestricted}
                                label="Aktifkan Pembatasan Lokasi"
                                description="Hanya pelanggan di dalam radius area kafe yang bisa melihat menu & checkout."
                            />

                            {isLocationRestricted && !hasCoordinates && (
                                <div className="rounded-xl border border-[#FDE68A] bg-[#FEF3C7] px-3.5 py-2.5 text-xs font-semibold text-[#92400E]">
                                    Pilih titik kafe pada peta atau klik
                                    &ldquo;Gunakan Lokasi Saya Saat Ini&rdquo;
                                    sebelum menyimpan agar pembatasan dapat
                                    diterapkan.
                                </div>
                            )}

                            <div className="grid gap-1.5">
                                <Label
                                    htmlFor="cafe_name"
                                    className="text-xs font-bold text-[#18181B]"
                                >
                                    Nama Lokasi / Outlet{' '}
                                    <span className="text-[#C52828]">*</span>
                                </Label>
                                <Input
                                    id="cafe_name"
                                    value={cafeName}
                                    onChange={(e) =>
                                        setCafeName(e.target.value)
                                    }
                                    placeholder="Café SIDE LINE"
                                    required
                                    className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] text-sm font-semibold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                />
                                <FieldError message={errors.cafe_name} />
                            </div>

                            <div className="grid gap-1.5">
                                <Label
                                    htmlFor="cafe_address"
                                    className="text-xs font-bold text-[#18181B]"
                                >
                                    Alamat Singkat Kafe (Opsional)
                                </Label>
                                <textarea
                                    id="cafe_address"
                                    rows={2}
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    placeholder="Ditampilkan kepada pelanggan di luar area agar mudah menemukan kafe..."
                                    className="w-full resize-none rounded-xl border border-[#E6DFD3] bg-[#FAF8F4] px-3 py-2 text-xs text-[#18181B] outline-none placeholder:text-[#A8A29E] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[3px] focus-visible:ring-[#C52828]/20"
                                />
                                <FieldError message={errors.address} />
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                                            setLatitudeInput(e.target.value)
                                        }
                                        placeholder="-6.200000"
                                        className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] font-mono text-xs font-semibold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                    />
                                    <FieldError message={errors.latitude} />
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
                                            setLongitudeInput(e.target.value)
                                        }
                                        placeholder="106.816666"
                                        className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] font-mono text-xs font-semibold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                    />
                                    <FieldError message={errors.longitude} />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label
                                        htmlFor="access_radius_meters"
                                        className="text-xs font-bold text-[#18181B]"
                                    >
                                        Radius Akses (Meter){' '}
                                        <span className="text-[#C52828]">
                                            *
                                        </span>
                                    </Label>
                                    <span className="rounded-md bg-[#F5EEDC] px-2 py-0.5 font-mono text-[11px] font-bold text-[#5B4126]">
                                        {parsedRadius} meter
                                    </span>
                                </div>

                                <div className="relative">
                                    <Input
                                        id="access_radius_meters"
                                        type="number"
                                        min={setting.min_radius_meters}
                                        max={setting.max_radius_meters}
                                        step={5}
                                        value={radiusInput}
                                        onChange={(e) =>
                                            setRadiusInput(e.target.value)
                                        }
                                        required
                                        className="h-10 rounded-xl border-[#E6DFD3] bg-[#FAF8F4] pr-14 font-mono text-sm font-bold text-[#18181B] focus-visible:border-[#C52828] focus-visible:bg-white focus-visible:ring-[#C52828]/20"
                                    />
                                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-bold text-[#78716C]">
                                        meter
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-1.5">
                                    {RADIUS_PRESETS.map((preset) => {
                                        const active =
                                            Number.parseInt(radiusInput, 10) ===
                                            preset;
                                        return (
                                            <button
                                                key={preset}
                                                type="button"
                                                onClick={() =>
                                                    setRadiusInput(
                                                        String(preset),
                                                    )
                                                }
                                                className={cn(
                                                    'cursor-pointer rounded-lg border px-2.5 py-1 text-[11px] font-bold transition',
                                                    active
                                                        ? 'border-[#C52828] bg-[#C52828] text-white shadow-2xs'
                                                        : 'border-[#E8DFC8] bg-[#FAF6EC] text-[#5B4126] hover:border-[#C52828]/40 hover:bg-[#F5EEDC]',
                                                )}
                                            >
                                                {preset >= 1000
                                                    ? `${preset / 1000} km`
                                                    : `${preset} m`}
                                            </button>
                                        );
                                    })}
                                </div>
                                <FieldError
                                    message={errors.access_radius_meters}
                                />
                            </div>

                            <div className="border-t border-[#EFE5CF] pt-4">
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="h-11 w-full cursor-pointer gap-2 rounded-xl bg-[#C52828] text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                                >
                                    {isSubmitting ? (
                                        <span>Menyimpan Pengaturan...</span>
                                    ) : (
                                        <>
                                            <Save className="size-4" />
                                            <span>
                                                Simpan Pengaturan Lokasi
                                            </span>
                                            <CheckCircle2 className="size-3.5 opacity-80" />
                                        </>
                                    )}
                                </Button>
                            </div>
                        </Panel>
                    </div>
                </form>
            </AdminPage>
        </>
    );
}

LocationSettingsPage.layout = {
    breadcrumbs: [
        {
            title: 'Dashboard',
            href: '/dashboard',
        },
        {
            title: 'Lokasi & Radius Kafe',
            href: '/admin/location-settings',
        },
    ],
};
