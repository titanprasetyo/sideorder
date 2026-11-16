import { Head, Link } from '@inertiajs/react';
import { QrCode, Storefront, WarningCircle } from '@phosphor-icons/react';

export default function InvalidTable({ message }: { message: string }) {
    return (
        <>
            <Head title="Meja Tidak Valid • Café SIDE LINE" />

            <div className="flex min-h-screen items-center justify-center bg-[#141413] p-0 font-sans selection:bg-[#C52828] selection:text-white md:px-4 md:py-6">
                <div className="relative flex min-h-screen w-full max-w-md flex-col justify-between overflow-hidden bg-[#FAF8F4] p-6 shadow-2xl sm:max-w-lg md:min-h-[82vh] md:rounded-2xl md:border-[8px] md:border-[#242321]">
                    {/* Top Brand Header */}
                    <header className="animate-sideline-header flex items-center justify-between border-b border-[#EBE5DC] pb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="flex size-10 items-center justify-center overflow-hidden rounded-lg bg-[#C52828] shadow-sm ring-1 shadow-[#C52828]/20 ring-black/5">
                                <img
                                    src="/images/sideline-icon.png"
                                    alt="SIDELINE"
                                    className="size-full object-cover"
                                />
                            </div>
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[15px] leading-tight font-bold tracking-tight text-[#1A1A1A] uppercase">
                                        SIDE LINE
                                    </span>
                                </div>
                                <p className="text-[9px] font-semibold tracking-[0.14em] text-[#6E6A64] uppercase">
                                    Coffee &bull; Eatery
                                </p>
                            </div>
                        </div>

                        <span className="rounded-[4px] bg-[#FDECEB] px-2.5 py-1.5 text-[9.5px] leading-none font-semibold tracking-wide whitespace-nowrap text-[#C52828] uppercase">
                            Akses Meja
                        </span>
                    </header>

                    {/* Center Invalid QR Notice Card */}
                    <main className="animate-sideline-stage my-auto py-8">
                        <div className="space-y-5 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-7 text-center shadow-[0_4px_16px_rgba(26,26,26,0.04)]">
                            <div className="mx-auto flex size-16 items-center justify-center rounded-lg bg-[#FDECEB] text-[#C52828]">
                                <WarningCircle
                                    weight="duotone"
                                    className="size-8"
                                />
                            </div>

                            <div className="space-y-2">
                                <h1 className="text-xl font-bold tracking-tight text-[#1A1A1A]">
                                    QR Meja Tidak Valid
                                </h1>
                                <p className="text-xs leading-relaxed font-normal text-[#6E6A64] sm:text-sm">
                                    {message}
                                </p>
                            </div>

                            <div className="space-y-1.5 rounded-lg border border-[#E6DFD3] bg-[#F3EFE6] p-4 text-left">
                                <div className="flex items-center gap-2 text-xs font-bold text-[#1A1A1A]">
                                    <QrCode
                                        weight="bold"
                                        className="size-4 text-[#C52828]"
                                    />
                                    <span>Langkah Selanjutnya:</span>
                                </div>
                                <p className="text-xs leading-relaxed font-normal text-[#6E6A64]">
                                    Silakan pindai ulang stiker QR Code yang
                                    tertempel di meja Anda, atau hubungi barista
                                    / kasir untuk mendapatkan akses meja aktif.
                                </p>
                            </div>

                            <div className="pt-1">
                                <Link
                                    href="/"
                                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#C52828] px-5 text-[13.5px] font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] transition hover:bg-[#B02222]"
                                >
                                    <Storefront
                                        weight="bold"
                                        className="size-4.5"
                                    />
                                    <span>Kembali ke Beranda SIDE LINE</span>
                                </Link>
                            </div>
                        </div>
                    </main>

                    {/* Footer */}
                    <footer className="border-t border-[#EBE5DC] pt-3 text-center text-[11px] font-medium text-[#6E6A64]">
                        Café SIDE LINE &bull; Sistem Pemesanan Mandiri Meja
                    </footer>
                </div>
            </div>
        </>
    );
}
