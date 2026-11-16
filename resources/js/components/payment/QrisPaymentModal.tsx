import {
    ArrowLeft,
    ArrowsClockwise,
    Check,
    CheckCircle,
    Clock,
    Copy,
    DownloadSimple,
    QrCode,
    Receipt,
    Sparkle,
    WarningCircle,
} from '@phosphor-icons/react';
import QRCode from 'qrcode';
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { downloadDataUrlSafely } from '@/lib/safe-download';
import { cn } from '@/lib/utils';

export interface QrisPaymentViewProps {
    orderNumber: string;
    tableNumber: string;
    tableName?: string | null;
    customerName: string;
    totalAmount: number;
    onBackToStatus: () => void;
    onSimulateSuccess?: () => void;
    onSwitchToCash?: () => void;
    expiryMinutes?: number;
    showSimulator?: boolean;
    paymentGateway?: string | null;
    paymentGatewayLabel?: string | null;
    paymentChannel?: string | null;
    paymentReference?: string | null;
    checkoutUrl?: string | null;
    qrString?: string | null;
}

export function QrisPaymentView({
    orderNumber,
    tableNumber,
    tableName,
    customerName,
    totalAmount,
    onBackToStatus,
    onSimulateSuccess,
    onSwitchToCash,
    expiryMinutes = 15,
    showSimulator = false,
    paymentGateway,
    paymentGatewayLabel,
    paymentChannel,
    paymentReference,
    qrString,
}: QrisPaymentViewProps) {
    const [qrDataUrl, setQrDataUrl] = useState<string>('');
    const [isGeneratingQr, setIsGeneratingQr] = useState(true);
    const [timeLeftSeconds, setTimeLeftSeconds] = useState(expiryMinutes * 60);
    const [isSimulating, setIsSimulating] = useState(false);
    const [isCheckingStatus, setIsCheckingStatus] = useState(false);
    const [isCopiedAmount, setIsCopiedAmount] = useState(false);
    const [isCopiedOrder, setIsCopiedOrder] = useState(false);
    const [paymentSuccess, setPaymentSuccess] = useState(false);
    const [gatewayMeta, setGatewayMeta] = useState<{
        gateway: string;
        label: string;
        channel: string;
        reference: string | null;
        qrString: string | null;
        mode: string;
    }>({
        gateway: paymentGateway || 'xendit',
        label: paymentGatewayLabel || 'Xendit Payment Gateway',
        channel: paymentChannel || 'QRIS',
        reference: paymentReference || null,
        qrString: qrString || null,
        mode: 'sandbox_slot',
    });

    const formatRupiah = (val: number) => {
        return `Rp ${new Intl.NumberFormat('id-ID', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(val || 0)}`;
    };

    // Inisiasi sesi Xendit Payment Gateway pada slot backend (idempoten, fallback aman ke QRIS standar)
    useEffect(() => {
        let cancelled = false;
        const csrfToken = document
            .querySelector('meta[name="csrf-token"]')
            ?.getAttribute('content');

        fetch(`/payments/orders/${orderNumber}/initiate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-CSRF-TOKEN': csrfToken || '',
                'X-Requested-With': 'XMLHttpRequest',
            },
            body: JSON.stringify({
                payment_method: 'qris',
                gateway: paymentGateway || 'xendit',
                channel: paymentChannel || 'QRIS',
            }),
        })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (cancelled || !data?.success) return;
                if (data.already_paid) {
                    setPaymentSuccess(true);
                    return;
                }
                if (data.payment) {
                    setGatewayMeta((prev) => ({
                        gateway: data.payment.gateway || prev.gateway,
                        label:
                            data.payment.gateway_label ||
                            data.gateway?.label ||
                            prev.label,
                        channel: data.payment.channel || prev.channel,
                        reference:
                            data.payment.payment_reference || prev.reference,
                        qrString: data.payment.qr_string || prev.qrString,
                        mode:
                            data.payment.mode ||
                            data.gateway?.mode ||
                            prev.mode,
                    }));
                }
            })
            .catch(() => {
                // Tetap tampilkan EMVCo QR fallback tanpa mengganggu pelanggan
            });

        return () => {
            cancelled = true;
        };
    }, [orderNumber, paymentGateway, paymentChannel]);

    // Gunakan qr_string resmi dari Xendit bila tersedia, atau payload EMVCo/QRIS deterministik
    const qrisPayload = useMemo(() => {
        if (gatewayMeta.qrString && gatewayMeta.qrString.trim() !== '') {
            return gatewayMeta.qrString;
        }
        const cleanAmount = Math.round(totalAmount);
        return `00020101021226670016ID.CO.SIDELINE.WWW01189360099900000000010215ID10243928192010303UME51440014ID.LINKAJA.WWW01189360099900000000010215ID10243928192010303UME5204581253033605407${cleanAmount}5802ID5916SIDE LINE COFFEE6007BANDUNG61054011562200116${orderNumber}6304`;
    }, [gatewayMeta.qrString, totalAmount, orderNumber]);

    // Generate QR Code Data URL saat halaman dibuka
    useEffect(() => {
        setIsGeneratingQr(true);

        QRCode.toDataURL(qrisPayload, {
            width: 340,
            margin: 2,
            color: {
                dark: '#1A1A1A',
                light: '#FFFFFF',
            },
            errorCorrectionLevel: 'M',
        })
            .then((url) => {
                setQrDataUrl(url);
                setIsGeneratingQr(false);
            })
            .catch((err) => {
                console.error('Failed to generate QR code', err);
                setIsGeneratingQr(false);
            });
    }, [qrisPayload]);

    // Countdown Timer
    useEffect(() => {
        if (paymentSuccess || timeLeftSeconds <= 0) return;

        const timer = setInterval(() => {
            setTimeLeftSeconds((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [paymentSuccess, timeLeftSeconds]);

    const formattedTimer = useMemo(() => {
        const minutes = Math.floor(timeLeftSeconds / 60);
        const seconds = timeLeftSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, [timeLeftSeconds]);

    const handleCopyAmount = () => {
        navigator.clipboard.writeText(String(Math.round(totalAmount)));
        setIsCopiedAmount(true);
        toast.success('Nominal tagihan disalin ke clipboard!');
        setTimeout(() => setIsCopiedAmount(false), 2000);
    };

    const handleCopyOrder = () => {
        navigator.clipboard.writeText(orderNumber);
        setIsCopiedOrder(true);
        toast.success('Nomor pesanan disalin ke clipboard!');
        setTimeout(() => setIsCopiedOrder(false), 2000);
    };

    const handleDownloadQr = async () => {
        if (!qrDataUrl) return;
        try {
            await downloadDataUrlSafely(
                qrDataUrl,
                `QRIS-XENDIT-${orderNumber}.png`,
            );
            toast.success('Gambar QRIS berhasil diunduh!');
        } catch {
            toast.error('Gagal mengunduh gambar QRIS.');
        }
    };

    const handleCheckPayment = async () => {
        setIsCheckingStatus(true);
        try {
            const res = await fetch(`/order/check-payment/${orderNumber}`, {
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            const data = await res.json();

            if (data.latest_payment) {
                setGatewayMeta((prev) => ({
                    ...prev,
                    reference:
                        data.latest_payment.payment_reference || prev.reference,
                    label: data.payment_gateway_label || prev.label,
                }));
            }

            if (data.is_paid) {
                setPaymentSuccess(true);
                toast.success('Pembayaran Xendit QRIS lunas terverifikasi!');
                if (onSimulateSuccess) {
                    setTimeout(() => {
                        onSimulateSuccess();
                        onBackToStatus();
                    }, 900);
                }
            } else if (data.payment_status === 'failed') {
                toast.error(
                    'Pembayaran gagal atau kedaluwarsa. Silakan coba lagi atau bayar tunai di kasir.',
                );
            } else {
                toast.info(
                    'Belum ada dana masuk via Xendit. Silakan selesaikan scan di e-wallet atau mobile banking Anda.',
                );
            }
        } catch {
            toast.error(
                'Gagal memeriksa status pembayaran. Pastikan koneksi internet stabil.',
            );
        } finally {
            setIsCheckingStatus(false);
        }
    };

    // Simulasi Siklus Pembayaran Gateway (Berhasil, Gagal, Expired, Pending)
    const handleSimulateStatus = async (
        status: 'paid' | 'failed' | 'expire' | 'pending',
    ) => {
        setIsSimulating(true);
        try {
            const csrfToken = document
                .querySelector('meta[name="csrf-token"]')
                ?.getAttribute('content');
            const res = await fetch(`/order/simulate-payment/${orderNumber}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken || '',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify({ status }),
            });

            const data = await res.json().catch(() => null);

            if (res.ok && data?.success) {
                if (status === 'paid') {
                    setPaymentSuccess(true);
                    toast.success(
                        data.message || 'Pembayaran berhasil dikonfirmasi!',
                    );
                    if (onSimulateSuccess) {
                        setTimeout(() => {
                            onSimulateSuccess();
                            onBackToStatus();
                        }, 900);
                    }
                } else if (status === 'failed') {
                    toast.error(
                        'Simulasi: Pembayaran gagal atau ditolak oleh gateway.',
                    );
                    if (onSimulateSuccess) onSimulateSuccess();
                    onBackToStatus();
                } else if (status === 'expire') {
                    toast.warning('Simulasi: Batas waktu QRIS kedaluwarsa.');
                    if (onSimulateSuccess) onSimulateSuccess();
                    onBackToStatus();
                } else {
                    toast.info(
                        'Simulasi: Status diatur ke menunggu pembayaran (pending).',
                    );
                    if (onSimulateSuccess) onSimulateSuccess();
                }
            } else {
                throw new Error(
                    data?.message || 'Gagal mengubah status pembayaran.',
                );
            }
        } catch (err: any) {
            toast.error(
                err?.message || 'Gagal menghubungi server payment gateway.',
            );
        } finally {
            setIsSimulating(false);
        }
    };

    return (
        <>
            {/* Top Sticky Header Halaman Pembayaran QRIS */}
            <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[#EBE5DC] bg-[#FAF8F4]/95 px-4 py-3 backdrop-blur-xs">
                <button
                    type="button"
                    onClick={onBackToStatus}
                    className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] px-3 py-1.5 text-[11px] leading-none font-semibold whitespace-nowrap text-[#1A1A1A] transition hover:bg-[#EAE3D5]"
                >
                    <ArrowLeft weight="bold" className="size-3.5" />
                    <span>Status & Nota</span>
                </button>

                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate rounded-[4px] bg-[#FDECEB] px-2.5 py-1.5 text-[10px] leading-none font-semibold whitespace-nowrap text-[#C52828]">
                        {gatewayMeta.label} &bull; {gatewayMeta.channel}
                    </span>
                    <span className="shrink-0 rounded-[4px] bg-[#1A1A1A] px-2.5 py-1.5 text-[10px] leading-none font-bold whitespace-nowrap text-white">
                        MEJA {tableNumber}
                    </span>
                </div>
            </header>

            <main className="flex-1 space-y-4 p-4 sm:p-5">
                {paymentSuccess ? (
                    /* TAMPILAN PEMBAYARAN BERHASIL */
                    <div className="space-y-5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-6 text-center shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                        <div className="mx-auto flex size-16 items-center justify-center rounded-full border border-[#CBEBD6] bg-[#EAF8EF] text-[#157F3D]">
                            <CheckCircle weight="fill" className="size-10" />
                        </div>

                        <div className="space-y-1.5">
                            <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">
                                Pembayaran QRIS Berhasil!
                            </h1>
                            <p className="mx-auto max-w-xs text-[13px] leading-relaxed text-[#6E6A64]">
                                Tagihan pesanan{' '}
                                <strong className="font-bold text-[#1A1A1A] tabular-nums">
                                    #{orderNumber}
                                </strong>{' '}
                                sebesar{' '}
                                <strong className="font-bold text-[#C52828] tabular-nums">
                                    {formatRupiah(totalAmount)}
                                </strong>{' '}
                                telah terverifikasi via {gatewayMeta.label}.
                            </p>
                        </div>

                        <div className="space-y-2 rounded-lg border border-[#E8E2D9] bg-[#FAF8F4] p-4 text-left text-xs tabular-nums">
                            <div className="flex justify-between text-[#6E6A64]">
                                <span>Pemesan</span>
                                <span className="font-bold text-[#1A1A1A]">
                                    {customerName}
                                </span>
                            </div>
                            <div className="flex justify-between text-[#6E6A64]">
                                <span>Meja</span>
                                <span className="font-semibold text-[#1A1A1A]">
                                    Meja {tableNumber}{' '}
                                    {tableName ? `(${tableName})` : ''}
                                </span>
                            </div>
                            <div className="flex justify-between text-[#6E6A64]">
                                <span>Metode Pembayaran</span>
                                <span className="font-semibold text-[#1A1A1A]">
                                    {gatewayMeta.channel} Online
                                </span>
                            </div>
                            <div className="flex justify-between text-[#6E6A64]">
                                <span>Gateway Pembayaran</span>
                                <span className="font-semibold text-[#1A1A1A]">
                                    {gatewayMeta.label}
                                </span>
                            </div>
                            {gatewayMeta.reference && (
                                <div className="flex justify-between gap-2 text-[#6E6A64]">
                                    <span>Referensi Transaksi</span>
                                    <span className="truncate font-mono text-[11px] font-semibold text-[#1A1A1A]">
                                        {gatewayMeta.reference}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-[#6E6A64]">
                                <span>Status</span>
                                <span className="font-bold text-[#157F3D]">
                                    LUNAS (SETTLED)
                                </span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={onBackToStatus}
                            className="flex h-13 w-full cursor-pointer items-center justify-center rounded-xl bg-[#C52828] px-6 text-sm font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] transition hover:bg-[#B02222] active:scale-[0.99]"
                        >
                            Lihat Status & Progres Pesanan
                        </button>
                    </div>
                ) : (
                    <>
                        {/* KARTU 1: Info Merchant & Total Tagihan QRIS */}
                        <div className="overflow-hidden rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                            {/* Banner Header Merchant Charcoal */}
                            <div className="space-y-3 bg-[#1A1A1A] px-5 py-4 text-white">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="inline-flex shrink-0 items-center rounded-[4px] bg-[#C52828] px-2 py-1 text-[10px] leading-none font-bold tracking-wider text-white uppercase">
                                            {gatewayMeta.channel}
                                        </span>
                                        <span className="truncate rounded-[4px] border border-white/15 bg-white/10 px-2 py-1 text-[8.5px] leading-none font-semibold tracking-wider whitespace-nowrap text-[#EFEADF] uppercase">
                                            {gatewayMeta.label}
                                        </span>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleCopyOrder}
                                        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[4px] bg-white/12 px-2 py-1 text-[9.5px] leading-none font-semibold whitespace-nowrap text-[#FAF8F4] tabular-nums transition hover:bg-white/20"
                                        title="Salin Nomor Pesanan"
                                    >
                                        {isCopiedOrder ? (
                                            <Check
                                                weight="bold"
                                                className="size-3 text-emerald-400"
                                            />
                                        ) : (
                                            <Copy
                                                weight="bold"
                                                className="size-3 text-[#EFEADF]"
                                            />
                                        )}
                                        <span>#{orderNumber}</span>
                                    </button>
                                </div>

                                <div className="flex items-end justify-between gap-3 pt-0.5">
                                    <div className="min-w-0">
                                        <h1 className="text-[18px] leading-snug font-bold tracking-tight text-white">
                                            SIDE LINE COFFEE
                                        </h1>
                                        <p className="truncate text-[11px] font-normal text-[#B8B0A4] tabular-nums">
                                            NMID: ID1024392819201 &bull;{' '}
                                            {gatewayMeta.reference
                                                ? `Ref: ${gatewayMeta.reference}`
                                                : gatewayMeta.label}
                                        </p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <span className="block text-[10px] font-medium tracking-wider text-[#B8B0A4] uppercase">
                                            Pemesan
                                        </span>
                                        <span className="block max-w-[150px] truncate text-xs font-bold text-white">
                                            {customerName}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Baris Nominal Tagihan & Tombol Salin */}
                            <div className="flex items-center justify-between gap-3 bg-[#FFFDFB] px-5 py-4">
                                <div>
                                    <span className="block text-[11px] font-semibold tracking-wider text-[#6E6A64] uppercase">
                                        Total Tagihan QRIS
                                    </span>
                                    <span className="mt-0.5 block text-[24px] leading-tight font-bold text-[#C52828] tabular-nums">
                                        {formatRupiah(totalAmount)}
                                    </span>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCopyAmount}
                                    className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] px-4 text-xs font-semibold text-[#1A1A1A] transition hover:bg-[#EAE3D5] active:scale-95"
                                >
                                    {isCopiedAmount ? (
                                        <>
                                            <Check
                                                weight="bold"
                                                className="size-3.5 text-[#157F3D]"
                                            />
                                            <span>Tersalin</span>
                                        </>
                                    ) : (
                                        <>
                                            <Copy
                                                weight="bold"
                                                className="size-3.5 text-[#4A2C18]"
                                            />
                                            <span>Salin Nominal</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* KARTU 2: Area Kode QRIS & Tombol Unduh */}
                        <div className="flex flex-col items-center rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-5 shadow-[0_2px_12px_rgba(26,26,26,0.03)]">
                            {/* Countdown Pill */}
                            <div className="mb-4 inline-flex items-center gap-1.5 rounded-[4px] bg-[#FDECEB] px-3.5 py-1.5 text-xs font-semibold text-[#C52828]">
                                <Clock
                                    weight="fill"
                                    className="size-4 text-[#C52828]"
                                />
                                <span>Selesaikan pembayaran dalam</span>
                                <span className="font-bold tabular-nums">
                                    {formattedTimer}
                                </span>
                            </div>

                            {/* QR Code Frame */}
                            <div className="relative rounded-xl border border-[#E8E2D9] bg-white p-3.5 shadow-2xs">
                                {isGeneratingQr ? (
                                    <div className="flex size-60 flex-col items-center justify-center gap-2 text-[#6E6A64] sm:size-64">
                                        <ArrowsClockwise className="size-8 animate-spin text-[#C52828]" />
                                        <span className="text-xs font-semibold">
                                            Menyiapkan kode QRIS...
                                        </span>
                                    </div>
                                ) : (
                                    <div className="relative">
                                        <img
                                            src={qrDataUrl}
                                            alt={`QRIS ${orderNumber}`}
                                            className="size-60 rounded-lg object-contain sm:size-64"
                                        />
                                        {/* Center QRIS Emblem */}
                                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                                            <div className="flex size-10 items-center justify-center rounded-lg border border-[#E8E2D9] bg-[#FFFDFB] shadow-sm">
                                                <QrCode
                                                    weight="duotone"
                                                    className="size-5.5 text-[#C52828]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <p className="mt-3.5 max-w-xs text-center text-[12.5px] leading-relaxed font-normal text-[#6E6A64]">
                                Pindai kode QR di atas menggunakan aplikasi
                                E-Wallet atau Mobile Banking pilihan Anda.
                            </p>

                            {/* Action Button: Unduh QR */}
                            <button
                                type="button"
                                onClick={handleDownloadQr}
                                className="mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] px-4 text-xs font-semibold text-[#1A1A1A] transition hover:bg-[#EAE3D5]"
                            >
                                <DownloadSimple
                                    weight="bold"
                                    className="size-4 text-[#4A2C18]"
                                />
                                <span>Unduh Gambar QR</span>
                            </button>
                        </div>

                        {/* KARTU 4: Simulator Payment Gateway (Hanya muncul di Sandbox Dev / Staf Terautentikasi) */}
                        {showSimulator && (
                            <div className="space-y-2.5 rounded-xl border border-[#E6DFD3] bg-[#F3EFE6] p-4">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#1A1A1A]">
                                        <Sparkle
                                            weight="fill"
                                            className="size-4 text-[#C52828]"
                                        />
                                        <span>
                                            Simulator {gatewayMeta.label}
                                        </span>
                                    </div>
                                    <span className="rounded-[4px] border border-[#E6DFD3] bg-[#FFFDFB] px-2.5 py-0.5 text-[10px] font-semibold text-[#6E6A64]">
                                        {gatewayMeta.mode === 'production'
                                            ? 'Production'
                                            : gatewayMeta.mode === 'sandbox'
                                              ? 'Sandbox Active'
                                              : 'Sandbox Slot'}
                                    </span>
                                </div>
                                <p className="text-[11px] leading-snug text-[#6E6A64]">
                                    Uji respons webhook/callback{' '}
                                    {gatewayMeta.label} langsung ke database:
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleSimulateStatus('paid')
                                        }
                                        disabled={isSimulating}
                                        className="inline-flex h-9.5 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-[#157F3D] px-3 text-xs font-bold text-white shadow-2xs transition hover:bg-[#126B33] disabled:opacity-50"
                                    >
                                        <CheckCircle
                                            weight="bold"
                                            className="size-3.5"
                                        />
                                        <span>Lunas (Settled)</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleSimulateStatus('failed')
                                        }
                                        disabled={isSimulating}
                                        className="inline-flex h-9.5 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#F5C2C0] bg-[#FDECEB] px-3 text-xs font-bold text-[#C52828] transition hover:bg-[#FBD8D6] disabled:opacity-50"
                                    >
                                        <WarningCircle
                                            weight="bold"
                                            className="size-3.5"
                                        />
                                        <span>Gagal (Denied)</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleSimulateStatus('expire')
                                        }
                                        disabled={isSimulating}
                                        className="inline-flex h-9.5 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-[#FFFDFB] px-3 text-xs font-semibold text-[#4A2C18] transition hover:bg-[#EFEADF] disabled:opacity-50"
                                    >
                                        <Clock
                                            weight="bold"
                                            className="size-3.5"
                                        />
                                        <span>Kedaluwarsa</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() =>
                                            handleSimulateStatus('pending')
                                        }
                                        disabled={isSimulating}
                                        className="inline-flex h-9.5 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[#E6DFD3] bg-[#FFFDFB] px-3 text-xs font-semibold text-[#3F3A34] transition hover:bg-[#EFEADF] disabled:opacity-50"
                                    >
                                        <ArrowsClockwise
                                            weight="bold"
                                            className="size-3.5"
                                        />
                                        <span>Reset Pending</span>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* TOMBOL AKSI UTAMA BAWAH */}
                        <div className="space-y-2.5 pt-1">
                            <button
                                type="button"
                                onClick={handleCheckPayment}
                                disabled={isCheckingStatus}
                                className={cn(
                                    'flex h-13 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#C52828] px-5 text-[14px] font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] transition hover:bg-[#B02222] active:scale-[0.99] disabled:opacity-60',
                                )}
                            >
                                <ArrowsClockwise
                                    weight="bold"
                                    className={cn(
                                        'size-4.5',
                                        isCheckingStatus && 'animate-spin',
                                    )}
                                />
                                <span>
                                    {isCheckingStatus
                                        ? 'Memeriksa Status Pembayaran...'
                                        : 'Cek Status Pembayaran'}
                                </span>
                            </button>

                            <div className="w-full">
                                <button
                                    type="button"
                                    onClick={onBackToStatus}
                                    className="flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] transition hover:bg-[#F3EFE6]"
                                >
                                    <Receipt
                                        weight="bold"
                                        className="size-4 text-[#4A2C18]"
                                    />
                                    <span>Lihat Nota & Status</span>
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </main>
        </>
    );
}
