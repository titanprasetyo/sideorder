import { Head } from '@inertiajs/react';
import { AlertCircle, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function InvalidTable({ message }: { message: string }) {
    return (
        <>
            <Head title="Meja Tidak Valid - Café SIDE LINE" />

            <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4 font-sans">
                <div className="max-w-md w-full bg-card rounded-2xl border shadow-sm p-8 text-center space-y-4">
                    <div className="size-16 rounded-full bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                        <AlertCircle className="size-8 stroke-[1.5]" />
                    </div>

                    <div className="space-y-1">
                        <h2 className="font-heading text-xl font-bold tracking-tight">QR Meja Tidak Valid</h2>
                        <p className="text-muted-foreground text-sm">
                            {message}
                        </p>
                    </div>

                    <div className="pt-2 text-xs text-muted-foreground border-t">
                        <div className="flex items-center justify-center gap-1.5 font-medium text-foreground">
                            <Coffee className="size-4" />
                            Café SIDE LINE
                        </div>
                        <p className="mt-1">Silakan tanyakan kepada barista atau kasir untuk mendapatkan barcode meja yang aktif.</p>
                    </div>
                </div>
            </div>
        </>
    );
}
