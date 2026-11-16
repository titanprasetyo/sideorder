import { useFlashToast } from '@/hooks/use-flash-toast';
import { useAppearance } from '@/hooks/use-appearance';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster({ position = 'top-center', ...props }: ToasterProps) {
    const { appearance } = useAppearance();

    useFlashToast();

    return (
        <Sonner
            theme={appearance}
            className="toaster group font-sans"
            position={position}
            toastOptions={{
                classNames: {
                    toast: 'group toast font-sans rounded-2xl border border-[#E8DFC8] bg-[#FFFDF9] text-[#18181B] shadow-lg',
                    title: 'font-sans font-bold text-xs sm:text-sm tracking-tight text-[#18181B]',
                    description: 'font-sans font-medium text-xs text-[#78716C]',
                    actionButton: 'font-sans font-bold bg-[#C52828] text-white rounded-xl',
                    cancelButton: 'font-sans font-semibold bg-[#F5EEDC] text-[#3F2D1C] rounded-xl',
                },
            }}
            style={
                {
                    '--normal-bg': 'var(--popover)',
                    '--normal-text': 'var(--popover-foreground)',
                    '--normal-border': 'var(--border)',
                    fontFamily: 'var(--font-sans)',
                } as React.CSSProperties
            }
            {...props}
        />
    );
}

export { Toaster };
