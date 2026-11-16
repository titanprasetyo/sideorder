export default function Heading({
    title,
    description,
    variant = 'default',
}: {
    title: string;
    description?: string;
    variant?: 'default' | 'small';
}) {
    return (
        <header
            className={
                variant === 'small' ? 'font-sans' : 'mb-6 space-y-1 font-sans'
            }
        >
            <h2
                className={
                    variant === 'small'
                        ? 'mb-0.5 font-heading text-base font-bold tracking-tight text-[#18181B]'
                        : 'font-heading text-xl font-extrabold tracking-tight text-[#18181B] sm:text-2xl'
                }
            >
                {title}
            </h2>
            {description && (
                <p className="text-xs font-medium text-[#78716C] sm:text-sm">
                    {description}
                </p>
            )}
        </header>
    );
}
