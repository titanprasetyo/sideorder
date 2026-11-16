import {
    BeerBottle,
    BeerStein,
    BowlFood,
    Coffee,
    Cookie,
    IceCream,
    IconBase,
    Martini,
    PintGlass,
    TeaBag,
    Wine,
    type IconProps,
    type IconWeight,
} from '@phosphor-icons/react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export type SizeIconKey =
    | 'cup-small'
    | 'cup-medium'
    | 'cup-large'
    | 'pint-small'
    | 'pint-medium'
    | 'pint-large'
    | 'coffee-small'
    | 'coffee-medium'
    | 'coffee-large'
    | 'mug'
    | 'tea-cup'
    | 'wine-glass'
    | 'martini-glass'
    | 'bottle'
    | 'bowl'
    | 'ice-cream'
    | 'cookie';

export interface SizeIconDefinition {
    key: SizeIconKey;
    label: string;
    shortLabel: string;
    category: 'cup' | 'glass' | 'coffee' | 'other';
    scaleClass: string;
}

/**
 * Custom Phosphor-compatible IconBase definitions for takeaway cups
 * with visually distinguishable Small, Medium, and Large proportions.
 */
const cupSmallWeights = new Map<IconWeight, React.ReactElement>([
    [
        'duotone',
        <>
            {/* Cup Body Fill (Rich Coffee) */}
            <path
                d="M78,108 L178,108 L166,222 A12,12 0 0 1 154,232 L102,232 A12,12 0 0 1 90,222 Z"
                fill="#5E3A22"
            />
            {/* Upper Foam / Rim Inner Fill */}
            <path d="M75,90 L181,90 L178,108 L78,108 Z" fill="#F5EFE6" />
            {/* Lid Top Fill */}
            <path
                d="M84,64 L172,64 A8,8 0 0 1 180,72 L180,78 L76,78 L76,72 A8,8 0 0 1 84,64 Z"
                fill="#EFE7DA"
            />
            {/* Outlines */}
            <path
                d="M75,90 L181,90 L166,222 A12,12 0 0 1 154,232 L102,232 A12,12 0 0 1 90,222 Z"
                fill="none"
                stroke="#4A2C18"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <rect
                x="66"
                y="76"
                width="124"
                height="15"
                rx="6"
                fill="#FBF7F0"
                stroke="#4A2C18"
                strokeWidth="11"
            />
            <path
                d="M82,76 L88,62 A8,8 0 0 1 95,57 L161,57 A8,8 0 0 1 168,62 L174,76"
                fill="#FBF7F0"
                stroke="#4A2C18"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <line
                x1="78"
                y1="108"
                x2="178"
                y2="108"
                stroke="#4A2C18"
                strokeWidth="9"
            />
        </>,
    ],
]);

const cupMediumWeights = new Map<IconWeight, React.ReactElement>([
    [
        'duotone',
        <>
            {/* Upper Creamy Milk Layer */}
            <path d="M72,78 L184,78 L176,162 L80,162 Z" fill="#F8F4EC" />
            {/* Lower Rich Coffee Fill */}
            <path
                d="M80,162 L176,162 L168,224 A12,12 0 0 1 156,234 L100,234 A12,12 0 0 1 88,224 Z"
                fill="#5E3A22"
            />
            {/* Subtle Coffee Wave Divider */}
            <path
                d="M80,162 Q104,168 128,162 T176,162"
                fill="none"
                stroke="#7A4E2D"
                strokeWidth="8"
            />
            {/* Cup Body Outline */}
            <path
                d="M72,78 L184,78 L168,224 A12,12 0 0 1 156,234 L100,234 A12,12 0 0 1 88,224 Z"
                fill="none"
                stroke="#4A2C18"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Lid Rim */}
            <rect
                x="62"
                y="63"
                width="132"
                height="15"
                rx="6"
                fill="#FBF7F0"
                stroke="#4A2C18"
                strokeWidth="11"
            />
            {/* Lid Top */}
            <path
                d="M78,63 L85,48 A8,8 0 0 1 92,43 L164,43 A8,8 0 0 1 171,48 L178,63"
                fill="#FBF7F0"
                stroke="#4A2C18"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </>,
    ],
]);

const cupLargeWeights = new Map<IconWeight, React.ReactElement>([
    [
        'duotone',
        <>
            {/* Tall Cup Body Fill (Rich Coffee) */}
            <path
                d="M70,76 L186,76 L170,226 A12,12 0 0 1 158,236 L98,236 A12,12 0 0 1 86,226 Z"
                fill="#5E3A22"
            />
            {/* Thin Cream Top Band */}
            <path d="M68,60 L188,60 L186,76 L70,76 Z" fill="#F5EFE6" />
            {/* Tall Cup Body Outline */}
            <path
                d="M68,60 L188,60 L170,226 A12,12 0 0 1 158,236 L98,236 A12,12 0 0 1 86,226 Z"
                fill="none"
                stroke="#4A2C18"
                strokeWidth="12"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* Lid Rim */}
            <rect
                x="58"
                y="45"
                width="140"
                height="15"
                rx="6"
                fill="#FBF7F0"
                stroke="#4A2C18"
                strokeWidth="11"
            />
            {/* Lid Top */}
            <path
                d="M74,45 L82,29 A8,8 0 0 1 89,24 L167,24 A8,8 0 0 1 174,29 L182,45"
                fill="#FBF7F0"
                stroke="#4A2C18"
                strokeWidth="11"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <line
                x1="70"
                y1="76"
                x2="186"
                y2="76"
                stroke="#4A2C18"
                strokeWidth="9"
            />
        </>,
    ],
]);

const sectionHeaderCupWeights = new Map<IconWeight, React.ReactElement>([
    [
        'duotone',
        <>
            <path
                d="M74,116 L182,116 L175,172 L81,172 Z"
                fill="#5E3A22"
                opacity="0.22"
            />
            <path
                d="M68,70 L188,70 L170,224 A12,12 0 0 1 158,234 L98,234 A12,12 0 0 1 86,224 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <rect
                x="56"
                y="52"
                width="144"
                height="18"
                rx="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="14"
            />
            <path
                d="M76,52 L84,34 A8,8 0 0 1 92,28 L164,28 A8,8 0 0 1 172,34 L180,52"
                fill="none"
                stroke="currentColor"
                strokeWidth="14"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <line
                x1="74"
                y1="116"
                x2="182"
                y2="116"
                stroke="currentColor"
                strokeWidth="12"
            />
        </>,
    ],
]);

export const CupSmallPhosphorIcon = React.forwardRef<SVGSVGElement, IconProps>(
    (props, ref) => (
        <IconBase
            ref={ref}
            {...props}
            weight="duotone"
            weights={cupSmallWeights}
        />
    ),
);
CupSmallPhosphorIcon.displayName = 'CupSmallPhosphorIcon';

export const CupMediumPhosphorIcon = React.forwardRef<SVGSVGElement, IconProps>(
    (props, ref) => (
        <IconBase
            ref={ref}
            {...props}
            weight="duotone"
            weights={cupMediumWeights}
        />
    ),
);
CupMediumPhosphorIcon.displayName = 'CupMediumPhosphorIcon';

export const CupLargePhosphorIcon = React.forwardRef<SVGSVGElement, IconProps>(
    (props, ref) => (
        <IconBase
            ref={ref}
            {...props}
            weight="duotone"
            weights={cupLargeWeights}
        />
    ),
);
CupLargePhosphorIcon.displayName = 'CupLargePhosphorIcon';

export const CupHeaderPhosphorIcon = React.forwardRef<SVGSVGElement, IconProps>(
    (props, ref) => (
        <IconBase
            ref={ref}
            {...props}
            weight="duotone"
            weights={sectionHeaderCupWeights}
        />
    ),
);
CupHeaderPhosphorIcon.displayName = 'CupHeaderPhosphorIcon';

/**
 * Single source of truth for all configurable product size icons across Admin & Customer.
 */
export const SIZE_ICON_OPTIONS: SizeIconDefinition[] = [
    {
        key: 'cup-small',
        label: 'Cup Small (Kecil)',
        shortLabel: 'Cup S',
        category: 'cup',
        scaleClass: 'size-8',
    },
    {
        key: 'cup-medium',
        label: 'Cup Medium (Sedang)',
        shortLabel: 'Cup M',
        category: 'cup',
        scaleClass: 'size-9',
    },
    {
        key: 'cup-large',
        label: 'Cup Large (Besar)',
        shortLabel: 'Cup L',
        category: 'cup',
        scaleClass: 'size-10',
    },
    {
        key: 'pint-small',
        label: 'Gelas Dingin Small',
        shortLabel: 'Gelas S',
        category: 'glass',
        scaleClass: 'size-6',
    },
    {
        key: 'pint-medium',
        label: 'Gelas Dingin Medium',
        shortLabel: 'Gelas M',
        category: 'glass',
        scaleClass: 'size-7.5',
    },
    {
        key: 'pint-large',
        label: 'Gelas Dingin Large',
        shortLabel: 'Gelas L',
        category: 'glass',
        scaleClass: 'size-9',
    },
    {
        key: 'coffee-small',
        label: 'Cangkir Kopi Small',
        shortLabel: 'Kopi S',
        category: 'coffee',
        scaleClass: 'size-6',
    },
    {
        key: 'coffee-medium',
        label: 'Cangkir Kopi Medium',
        shortLabel: 'Kopi M',
        category: 'coffee',
        scaleClass: 'size-7.5',
    },
    {
        key: 'coffee-large',
        label: 'Cangkir Kopi Large',
        shortLabel: 'Kopi L',
        category: 'coffee',
        scaleClass: 'size-9',
    },
    {
        key: 'mug',
        label: 'Mug / Gelas Gagang',
        shortLabel: 'Mug',
        category: 'other',
        scaleClass: 'size-7.5',
    },
    {
        key: 'tea-cup',
        label: 'Teh / Artisan Tea',
        shortLabel: 'Teh',
        category: 'other',
        scaleClass: 'size-7.5',
    },
    {
        key: 'wine-glass',
        label: 'Gelas Stem / Mocktail',
        shortLabel: 'Mocktail',
        category: 'other',
        scaleClass: 'size-7.5',
    },
    {
        key: 'martini-glass',
        label: 'Gelas Signature',
        shortLabel: 'Signature',
        category: 'other',
        scaleClass: 'size-7.5',
    },
    {
        key: 'bottle',
        label: 'Botol / Ready to Drink',
        shortLabel: 'Botol',
        category: 'other',
        scaleClass: 'size-7.5',
    },
    {
        key: 'bowl',
        label: 'Porsi Mangkuk / Bowl',
        shortLabel: 'Bowl',
        category: 'other',
        scaleClass: 'size-7.5',
    },
    {
        key: 'ice-cream',
        label: 'Scoop / Dessert',
        shortLabel: 'Dessert',
        category: 'other',
        scaleClass: 'size-7.5',
    },
    {
        key: 'cookie',
        label: 'Pastry / Snack',
        shortLabel: 'Snack',
        category: 'other',
        scaleClass: 'size-7.5',
    },
];

export const VALID_SIZE_ICON_KEYS = new Set<string>(
    SIZE_ICON_OPTIONS.map((o) => o.key),
);

/**
 * Resolves the canonical SizeIconKey from an explicit Admin-saved icon value,
 * or falls back deterministically based on the size option's name / index.
 */
export function resolveSizeIconKey(
    configuredIcon?: string | null,
    optionName?: string,
    index = 0,
): SizeIconKey {
    if (configuredIcon && VALID_SIZE_ICON_KEYS.has(configuredIcon)) {
        return configuredIcon as SizeIconKey;
    }

    const lower = (optionName ?? '').trim().toLowerCase();

    if (
        lower.includes('small') ||
        lower.includes('kecil') ||
        lower.includes('mini') ||
        lower === 's' ||
        lower.includes('8oz') ||
        lower.includes('12oz')
    ) {
        return 'cup-small';
    }

    if (
        lower.includes('medium') ||
        lower.includes('sedang') ||
        lower.includes('regular') ||
        lower.includes('reguler') ||
        lower === 'm' ||
        lower === 'r' ||
        lower.includes('14oz') ||
        lower.includes('16oz')
    ) {
        return 'cup-medium';
    }

    if (
        lower.includes('large') ||
        lower.includes('besar') ||
        lower.includes('jumbo') ||
        lower.includes('upsize') ||
        lower === 'l' ||
        lower === 'xl' ||
        lower.includes('20oz') ||
        lower.includes('22oz') ||
        lower.includes('1l')
    ) {
        return 'cup-large';
    }

    if (lower.includes('botol') || lower.includes('bottle')) {
        return 'bottle';
    }

    if (lower.includes('bowl') || lower.includes('mangkuk')) {
        return 'bowl';
    }

    const positionalDefaults: SizeIconKey[] = [
        'cup-small',
        'cup-medium',
        'cup-large',
    ];
    return positionalDefaults[Math.min(index, positionalDefaults.length - 1)];
}

export interface SizeOptionIconProps {
    icon?: string | null;
    name?: string;
    index?: number;
    className?: string;
    containerClassName?: string;
}

/**
 * Shared rendering component used by BOTH Admin and Customer to render product size icons.
 */
export function SizeOptionIcon({
    icon,
    name,
    index = 0,
    className,
    containerClassName,
}: SizeOptionIconProps) {
    const resolvedKey = resolveSizeIconKey(icon, name, index);
    const definition =
        SIZE_ICON_OPTIONS.find((opt) => opt.key === resolvedKey) ??
        SIZE_ICON_OPTIONS[0];

    const renderGlyph = () => {
        switch (resolvedKey) {
            case 'cup-small':
                return (
                    <CupSmallPhosphorIcon
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'cup-medium':
                return (
                    <CupMediumPhosphorIcon
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'cup-large':
                return (
                    <CupLargePhosphorIcon
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'pint-small':
            case 'pint-medium':
            case 'pint-large':
                return (
                    <PintGlass
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'coffee-small':
            case 'coffee-medium':
            case 'coffee-large':
                return (
                    <Coffee
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'mug':
                return (
                    <BeerStein
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'tea-cup':
                return (
                    <TeaBag
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'wine-glass':
                return (
                    <Wine
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'martini-glass':
                return (
                    <Martini
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'bottle':
                return (
                    <BeerBottle
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'bowl':
                return (
                    <BowlFood
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'ice-cream':
                return (
                    <IceCream
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
            case 'cookie':
                return (
                    <Cookie
                        weight="duotone"
                        color="#4A2C18"
                        className={cn(definition.scaleClass, className)}
                    />
                );
        }
    };

    return (
        <span
            className={cn(
                'inline-flex size-9 shrink-0 items-end justify-center select-none',
                containerClassName,
            )}
            data-size-icon={resolvedKey}
        >
            {renderGlyph()}
        </span>
    );
}
