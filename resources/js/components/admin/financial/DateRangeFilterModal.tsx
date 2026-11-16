import {
    Calendar as CalendarIcon,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    RotateCcw,
    Check,
    CalendarRange,
    Filter,
    Globe,
    BarChart3,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export interface DateFilterPreset {
    key: string;
    label: string;
    group: 'days' | 'week_month' | 'long_term' | 'other';
}

export const PRESET_GROUPS: { title: string; items: DateFilterPreset[] }[] = [
    {
        title: 'Harian & Rentang Hari',
        items: [
            { key: 'today', label: 'Hari Ini', group: 'days' },
            { key: 'yesterday', label: 'Kemarin', group: 'days' },
            { key: 'last_7_days', label: '7 Hari Terakhir', group: 'days' },
            { key: 'last_14_days', label: '14 Hari Terakhir', group: 'days' },
            { key: 'last_30_days', label: '30 Hari Terakhir', group: 'days' },
            { key: 'last_90_days', label: '90 Hari Terakhir', group: 'days' },
        ],
    },
    {
        title: 'Mingguan & Bulanan',
        items: [
            { key: 'this_week', label: 'Minggu Ini', group: 'week_month' },
            { key: 'last_week', label: 'Minggu Lalu', group: 'week_month' },
            { key: 'this_month', label: 'Bulan Ini', group: 'week_month' },
            { key: 'last_month', label: 'Bulan Lalu', group: 'week_month' },
        ],
    },
    {
        title: 'Jangka Panjang',
        items: [
            {
                key: 'last_3_months',
                label: '3 Bulan Terakhir',
                group: 'long_term',
            },
            {
                key: 'last_6_months',
                label: '6 Bulan Terakhir',
                group: 'long_term',
            },
            { key: 'this_year', label: 'Tahun Ini', group: 'long_term' },
            { key: 'last_year', label: 'Tahun Lalu', group: 'long_term' },
        ],
    },
];

export const ALL_PRESETS: DateFilterPreset[] = [
    ...PRESET_GROUPS.flatMap((g) => g.items),
    { key: 'all_time', label: 'Semua Waktu', group: 'other' },
    { key: 'custom', label: 'Rentang Kustom', group: 'other' },
];

export interface DateRangeFilterModalProps {
    currentPreset: string;
    currentStartDate: string;
    currentEndDate: string;
    currentPeriodLabel: string;
    compareMode?: string;
    compareStartDate?: string;
    compareEndDate?: string;
    compareLabel?: string | null;
    onApply: (params: {
        preset: string;
        start_date?: string;
        end_date?: string;
        compare_mode?: string;
        compare_start_date?: string;
        compare_end_date?: string;
    }) => void;
}

const MONTH_NAMES = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember',
];

const DAY_LABELS = ['MIN', 'SEN', 'SEL', 'RAB', 'KAM', 'JUM', 'SAB'];

const toDmy = (isoStr: string) => {
    if (!isoStr) return '';
    const parts = isoStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return isoStr;
};

export default function DateRangeFilterModal({
    currentPreset,
    currentStartDate,
    currentEndDate,
    currentPeriodLabel,
    onApply,
}: DateRangeFilterModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedPreset, setSelectedPreset] = useState(currentPreset);
    const [startDate, setStartDate] = useState(currentStartDate);
    const [endDate, setEndDate] = useState(currentEndDate);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Navigasi Kalender Kustom
    const initialCalendarDate = useMemo(() => {
        if (currentStartDate) {
            const parsed = new Date(currentStartDate);
            if (!isNaN(parsed.getTime())) return parsed;
        }
        return new Date();
    }, [currentStartDate]);

    const [calYear, setCalYear] = useState<number>(
        initialCalendarDate.getFullYear(),
    );
    const [calMonth, setCalMonth] = useState<number>(
        initialCalendarDate.getMonth(),
    ); // 0-11

    // Update state saat modal dibuka
    const handleOpen = () => {
        setSelectedPreset(currentPreset);
        setStartDate(currentStartDate);
        setEndDate(currentEndDate);
        setErrorMsg(null);

        const parsed = new Date(currentStartDate || Date.now());
        if (!isNaN(parsed.getTime())) {
            setCalYear(parsed.getFullYear());
            setCalMonth(parsed.getMonth());
        }
        setIsOpen(true);
    };

    const handlePrevMonth = () => {
        if (calMonth === 0) {
            setCalMonth(11);
            setCalYear((prev) => prev - 1);
        } else {
            setCalMonth((prev) => prev - 1);
        }
    };

    const handleNextMonth = () => {
        if (calMonth === 11) {
            setCalMonth(0);
            setCalYear((prev) => prev + 1);
        } else {
            setCalMonth((prev) => prev + 1);
        }
    };

    // Helper tanggal ISO YYYY-MM-DD
    const formatDateStr = (year: number, monthZeroIdx: number, day: number) => {
        const m = String(monthZeroIdx + 1).padStart(2, '0');
        const d = String(day).padStart(2, '0');
        return `${year}-${m}-${d}`;
    };

    const updateCalendarToDate = (dStr: string) => {
        if (!dStr) return;
        const parsed = new Date(dStr);
        if (!isNaN(parsed.getTime())) {
            setCalYear(parsed.getFullYear());
            setCalMonth(parsed.getMonth());
        }
    };

    // Grid tanggal dalam bulan aktif
    const calendarDays = useMemo(() => {
        const firstDay = new Date(calYear, calMonth, 1).getDay(); // 0: Sunday
        const totalDays = new Date(calYear, calMonth + 1, 0).getDate();
        const days: (number | null)[] = [];

        for (let i = 0; i < firstDay; i++) {
            days.push(null);
        }
        for (let d = 1; d <= totalDays; d++) {
            days.push(d);
        }
        return days;
    }, [calYear, calMonth]);

    // Klik tanggal kalender
    const handleDayClick = (day: number) => {
        const clickedStr = formatDateStr(calYear, calMonth, day);
        setSelectedPreset('custom');
        setErrorMsg(null);

        if (!startDate || (startDate && endDate && startDate !== endDate)) {
            setStartDate(clickedStr);
            setEndDate(clickedStr);
        } else {
            if (new Date(clickedStr) < new Date(startDate)) {
                setStartDate(clickedStr);
            } else {
                setEndDate(clickedStr);
            }
        }
    };

    // Pilih Preset Cepat
    const handleSelectPreset = (presetKey: string) => {
        setSelectedPreset(presetKey);
        setErrorMsg(null);

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const date = now.getDate();

        let sStr = '';
        let eStr = '';

        if (presetKey === 'today') {
            sStr = formatDateStr(year, month, date);
            eStr = sStr;
        } else if (presetKey === 'yesterday') {
            const yest = new Date(year, month, date - 1);
            sStr = formatDateStr(
                yest.getFullYear(),
                yest.getMonth(),
                yest.getDate(),
            );
            eStr = sStr;
        } else if (presetKey === 'last_7_days') {
            const start = new Date(year, month, date - 6);
            sStr = formatDateStr(
                start.getFullYear(),
                start.getMonth(),
                start.getDate(),
            );
            eStr = formatDateStr(year, month, date);
        } else if (presetKey === 'last_14_days') {
            const start = new Date(year, month, date - 13);
            sStr = formatDateStr(
                start.getFullYear(),
                start.getMonth(),
                start.getDate(),
            );
            eStr = formatDateStr(year, month, date);
        } else if (presetKey === 'last_30_days') {
            const start = new Date(year, month, date - 29);
            sStr = formatDateStr(
                start.getFullYear(),
                start.getMonth(),
                start.getDate(),
            );
            eStr = formatDateStr(year, month, date);
        } else if (presetKey === 'last_90_days') {
            const start = new Date(year, month, date - 89);
            sStr = formatDateStr(
                start.getFullYear(),
                start.getMonth(),
                start.getDate(),
            );
            eStr = formatDateStr(year, month, date);
        } else if (presetKey === 'this_week') {
            const dayOfWeek = (now.getDay() + 6) % 7; // Senin = 0
            const monday = new Date(year, month, date - dayOfWeek);
            sStr = formatDateStr(
                monday.getFullYear(),
                monday.getMonth(),
                monday.getDate(),
            );
            eStr = formatDateStr(year, month, date);
        } else if (presetKey === 'last_week') {
            const dayOfWeek = (now.getDay() + 6) % 7;
            const prevMon = new Date(year, month, date - dayOfWeek - 7);
            const prevSun = new Date(year, month, date - dayOfWeek - 1);
            sStr = formatDateStr(
                prevMon.getFullYear(),
                prevMon.getMonth(),
                prevMon.getDate(),
            );
            eStr = formatDateStr(
                prevSun.getFullYear(),
                prevSun.getMonth(),
                prevSun.getDate(),
            );
        } else if (presetKey === 'this_month') {
            sStr = formatDateStr(year, month, 1);
            const end = new Date(year, month + 1, 0);
            eStr = formatDateStr(year, month, end.getDate());
        } else if (presetKey === 'last_month') {
            const prevM = new Date(year, month - 1, 1);
            const end = new Date(year, month, 0);
            sStr = formatDateStr(prevM.getFullYear(), prevM.getMonth(), 1);
            eStr = formatDateStr(
                end.getFullYear(),
                end.getMonth(),
                end.getDate(),
            );
        } else if (presetKey === 'last_3_months') {
            const start = new Date(year, month - 2, 1);
            const end = new Date(year, month + 1, 0);
            sStr = formatDateStr(start.getFullYear(), start.getMonth(), 1);
            eStr = formatDateStr(year, month, end.getDate());
        } else if (presetKey === 'last_6_months') {
            const start = new Date(year, month - 5, 1);
            const end = new Date(year, month + 1, 0);
            sStr = formatDateStr(start.getFullYear(), start.getMonth(), 1);
            eStr = formatDateStr(year, month, end.getDate());
        } else if (presetKey === 'this_year') {
            sStr = `${year}-01-01`;
            eStr = `${year}-12-31`;
        } else if (presetKey === 'last_year') {
            sStr = `${year - 1}-01-01`;
            eStr = `${year - 1}-12-31`;
        }

        if (sStr && eStr) {
            setStartDate(sStr);
            setEndDate(eStr);
            updateCalendarToDate(eStr);
        }
    };

    const handleReset = () => {
        handleSelectPreset('this_month');
        setErrorMsg(null);
    };

    // Validasi dan Terapkan
    const handleApply = () => {
        if (selectedPreset === 'custom') {
            if (!startDate || !endDate) {
                setErrorMsg('Tanggal mulai dan akhir harus ditentukan.');
                return;
            }
            if (new Date(endDate) < new Date(startDate)) {
                setErrorMsg(
                    'Tanggal mulai tidak boleh melebihi tanggal akhir.',
                );
                return;
            }
        }

        onApply({
            preset: selectedPreset,
            start_date: selectedPreset === 'custom' ? startDate : undefined,
            end_date: selectedPreset === 'custom' ? endDate : undefined,
            compare_mode: 'none',
        });

        setIsOpen(false);
    };

    const activePresetObj = ALL_PRESETS.find((p) => p.key === currentPreset);
    const triggerLabel = activePresetObj
        ? activePresetObj.label
        : 'Pilih Periode';

    return (
        <>
            {/* Tombol Pemicu Dropdown di Header */}
            <button
                type="button"
                onClick={handleOpen}
                className="group flex h-11 cursor-pointer items-center gap-2.5 rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] px-3.5 text-xs font-bold text-neutral-800 shadow-2xs transition-all hover:border-[#D8B4FE] hover:bg-[#F3E8FF]"
                title="Buka pengaturan periode laporan"
            >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600 transition-colors group-hover:bg-purple-200">
                    <CalendarIcon className="size-4 text-purple-600" />
                </div>
                <div className="flex flex-col items-start text-left">
                    <span className="text-[10px] leading-tight font-bold text-neutral-500">
                        Periode Laporan
                    </span>
                    <span className="text-xs leading-tight font-extrabold text-neutral-900">
                        {triggerLabel}
                    </span>
                </div>
                <ChevronDown className="ml-1.5 size-4 shrink-0 text-purple-500 group-hover:text-purple-700" />
            </button>

            {/* Modal Dialog Pemilih Periode (Gaya Card Modal Pemesanan Meja QRIS) */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent
                    className="w-[95vw] gap-0 overflow-hidden rounded-2xl border border-[#E8E2D8] bg-[#FAF8F4] p-0 font-sans shadow-2xl sm:max-w-4xl"
                    style={{ maxWidth: '900px' }}
                >
                    {/* Sticky Header ala Card Modal Pemesanan Meja QRIS */}
                    <div className="border-b border-[#EBE5DC] bg-[#FAF8F4] px-5 pt-4 pr-14 pb-3.5">
                        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#FDECEB] px-2 py-0.5 text-[10px] font-bold tracking-wider text-[#C52828] uppercase">
                                <CalendarRange className="size-3" />
                                Periode Laporan
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-md bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-bold tracking-wider text-white uppercase">
                                <Globe className="size-2.5" />
                                Waktu Indonesia Barat (WIB)
                            </span>
                        </div>
                        <DialogHeader className="space-y-0.5 text-left">
                            <DialogTitle className="text-[17px] font-bold tracking-tight text-[#1A1A1A] sm:text-lg">
                                Pengaturan Periode Laporan
                            </DialogTitle>
                            <DialogDescription className="text-xs text-[#6E6A64]">
                                Pilih rentang waktu standar atau tentukan
                                tanggal laporan melalui kalender
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {/* Konten 2 Kolom di atas latar #FAF8F4 dengan Kartu Putih #FFFDFB */}
                    <div className="grid grid-cols-1 gap-4 bg-[#FAF8F4] p-4 sm:p-5 md:grid-cols-12">
                        {/* KOLOM KIRI: Daftar Pilihan Preset (5 Kolom) */}
                        <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)] md:col-span-5">
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 border-b border-[#EFEAE0] pb-1.5">
                                    <span className="h-3.5 w-1.5 rounded-full bg-[#C52828]" />
                                    <span className="text-[10px] font-black tracking-wider text-[#1A1A1A] uppercase">
                                        Rentang Waktu Standar
                                    </span>
                                </div>

                                <div className="space-y-2.5">
                                    {PRESET_GROUPS.map((group) => (
                                        <div
                                            key={group.title}
                                            className="space-y-1.5"
                                        >
                                            <div className="text-[10px] font-bold tracking-wider text-[#6E6A64] uppercase">
                                                {group.title}
                                            </div>
                                            <div className="grid grid-cols-2 gap-1.5">
                                                {group.items.map((p) => {
                                                    const isSelected =
                                                        selectedPreset ===
                                                        p.key;
                                                    return (
                                                        <button
                                                            key={p.key}
                                                            type="button"
                                                            onClick={() =>
                                                                handleSelectPreset(
                                                                    p.key,
                                                                )
                                                            }
                                                            className={`flex cursor-pointer items-center justify-between rounded-xl border px-2.5 py-1.5 text-left text-xs font-bold transition-all ${
                                                                isSelected
                                                                    ? 'border-[#C52828] bg-[#C52828] font-black text-white shadow-xs'
                                                                    : 'border-[#E8E2D9] bg-[#FAF8F4] text-[#1A1A1A] hover:border-[#D6CFC2] hover:bg-[#F3EFE6]'
                                                            }`}
                                                        >
                                                            <span className="truncate">
                                                                {p.label}
                                                            </span>
                                                            {isSelected && (
                                                                <Check className="ml-1 size-3 shrink-0 stroke-[3] text-white" />
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Tombol Cepat Reset */}
                            <div className="border-t border-[#EFEAE0] pt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleReset}
                                    className="h-8 w-full cursor-pointer justify-center gap-1.5 rounded-xl text-xs font-bold text-[#6E6A64] hover:bg-[#FAF8F4] hover:text-[#1A1A1A]"
                                >
                                    <RotateCcw className="size-3 text-[#C52828]" />
                                    <span>Atur Ulang ke Bulan Ini</span>
                                </Button>
                            </div>
                        </div>

                        {/* KOLOM KANAN: Kalender Interaktif & Input Tanggal Mulai/Akhir (7 Kolom) */}
                        <div className="flex flex-col justify-between gap-3 rounded-xl border border-[#E8E2D9] bg-[#FFFDFB] p-4 shadow-[0_2px_12px_rgba(26,26,26,0.03)] md:col-span-7">
                            {/* Header Kalender & Direct Jump Month/Year */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-0.5">
                                <span className="flex items-center gap-1.5 text-xs font-black tracking-wider text-[#1A1A1A] uppercase">
                                    <BarChart3 className="size-3.5 text-[#C52828]" />
                                    <span>Kalender Periode</span>
                                </span>

                                <div className="flex items-center gap-1.5">
                                    {/* Direct Month Selector */}
                                    <div className="relative">
                                        <select
                                            value={calMonth}
                                            onChange={(e) =>
                                                setCalMonth(
                                                    Number(e.target.value),
                                                )
                                            }
                                            className="h-7 cursor-pointer appearance-none rounded-lg border border-[#E6DFD3] bg-[#FAF8F4] px-2 text-xs font-bold text-[#1A1A1A] focus:ring-1 focus:ring-[#C52828] focus:outline-none"
                                        >
                                            {MONTH_NAMES.map((m, idx) => (
                                                <option key={idx} value={idx}>
                                                    {m}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Direct Year Selector */}
                                    <div className="relative">
                                        <select
                                            value={calYear}
                                            onChange={(e) =>
                                                setCalYear(
                                                    Number(e.target.value),
                                                )
                                            }
                                            className="h-7 cursor-pointer appearance-none rounded-lg border border-[#E6DFD3] bg-[#FAF8F4] px-2 font-mono text-xs font-bold text-[#1A1A1A] focus:ring-1 focus:ring-[#C52828] focus:outline-none"
                                        >
                                            {[
                                                2023, 2024, 2025, 2026, 2027,
                                                2028,
                                            ].map((y) => (
                                                <option key={y} value={y}>
                                                    {y}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Prev / Next Month Buttons */}
                                    <div className="flex items-center overflow-hidden rounded-lg border border-[#E6DFD3] bg-[#FAF8F4] shadow-2xs">
                                        <button
                                            type="button"
                                            onClick={handlePrevMonth}
                                            className="cursor-pointer p-1 text-[#1A1A1A] transition-colors hover:bg-[#EFECE6]"
                                            title="Bulan sebelumnya"
                                        >
                                            <ChevronLeft className="size-3.5" />
                                        </button>
                                        <div className="h-3.5 w-px bg-[#E6DFD3]" />
                                        <button
                                            type="button"
                                            onClick={handleNextMonth}
                                            className="cursor-pointer p-1 text-[#1A1A1A] transition-colors hover:bg-[#EFECE6]"
                                            title="Bulan berikutnya"
                                        >
                                            <ChevronRight className="size-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Grid Kalender Interaktif */}
                            <div className="rounded-xl border border-[#EBE5DC] bg-[#FAF8F4] p-2.5">
                                <div className="mb-1 grid grid-cols-7 gap-1 text-center">
                                    {DAY_LABELS.map((d, i) => (
                                        <span
                                            key={d}
                                            className={`text-[10px] font-black tracking-wider uppercase ${
                                                i === 0
                                                    ? 'text-[#C52828]'
                                                    : 'text-[#6E6A64]'
                                            }`}
                                        >
                                            {d}
                                        </span>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 gap-1 text-center">
                                    {calendarDays.map((day, idx) => {
                                        if (day === null) {
                                            return (
                                                <div
                                                    key={`empty-${idx}`}
                                                    className="h-7"
                                                />
                                            );
                                        }
                                        const dayDateStr = formatDateStr(
                                            calYear,
                                            calMonth,
                                            day,
                                        );
                                        const isStart =
                                            startDate === dayDateStr;
                                        const isEnd = endDate === dayDateStr;
                                        const inRange =
                                            startDate &&
                                            endDate &&
                                            new Date(dayDateStr) >=
                                                new Date(startDate) &&
                                            new Date(dayDateStr) <=
                                                new Date(endDate);

                                        return (
                                            <button
                                                key={`day-${day}`}
                                                type="button"
                                                onClick={() =>
                                                    handleDayClick(day)
                                                }
                                                className={`flex h-7 cursor-pointer items-center justify-center rounded-lg text-xs font-bold transition-all ${
                                                    isStart || isEnd
                                                        ? 'bg-[#C52828] font-black text-white shadow-xs'
                                                        : inRange
                                                          ? 'bg-[#FDECEB] font-bold text-[#C52828]'
                                                          : 'text-[#1A1A1A] hover:bg-[#EFECE6]'
                                                }`}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Manual Input Tanggal Mulai dan Akhir */}
                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="space-y-1">
                                    <label className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-[#6E6A64] uppercase">
                                        <CalendarIcon className="size-3 text-[#C52828]" />
                                        <span>Tanggal Mulai</span>
                                    </label>
                                    <Input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => {
                                            setSelectedPreset('custom');
                                            setStartDate(e.target.value);
                                            setErrorMsg(null);
                                            updateCalendarToDate(
                                                e.target.value,
                                            );
                                        }}
                                        className="h-9 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#F3EFE6]/70 font-mono text-xs font-bold text-[#1A1A1A]"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="flex items-center gap-1.5 text-[10px] font-black tracking-wider text-[#6E6A64] uppercase">
                                        <CalendarIcon className="size-3 text-[#C52828]" />
                                        <span>Tanggal Akhir</span>
                                    </label>
                                    <Input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => {
                                            setSelectedPreset('custom');
                                            setEndDate(e.target.value);
                                            setErrorMsg(null);
                                            updateCalendarToDate(
                                                e.target.value,
                                            );
                                        }}
                                        className="h-9 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#F3EFE6]/70 font-mono text-xs font-bold text-[#1A1A1A]"
                                    />
                                </div>
                            </div>

                            {/* Pesan Kesalahan Validasi jika ada */}
                            {errorMsg && (
                                <div className="rounded-xl border border-rose-200 bg-rose-50 p-2 text-xs font-bold text-rose-700">
                                    {errorMsg}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sticky Footer Dialog ala Card Modal QRIS */}
                    <DialogFooter className="flex items-center justify-between gap-3 border-t border-[#EBE5DC] bg-[#FAF8F4]/98 px-5 py-3.5 sm:justify-between">
                        <div className="flex items-center gap-2 text-xs font-medium text-[#1A1A1A]">
                            <span className="hidden font-semibold text-[#6E6A64] sm:inline">
                                Periode Terpilih:
                            </span>
                            <div className="flex items-center gap-1.5 rounded-xl bg-[#1A1A1A] px-3 py-1.5 font-mono font-bold text-white shadow-2xs">
                                <CalendarIcon className="size-3.5 text-[#C52828]" />
                                <span>
                                    {startDate && endDate
                                        ? `${toDmy(startDate)} – ${toDmy(endDate)}`
                                        : currentPeriodLabel}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsOpen(false)}
                                className="h-11 cursor-pointer rounded-xl border-[#E6DFD3] bg-[#FFFDFB] px-4 text-xs font-bold text-[#1A1A1A] hover:bg-[#F3EFE6]"
                            >
                                Batal
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleApply}
                                className="flex h-11 cursor-pointer items-center gap-1.5 rounded-xl bg-[#C52828] px-5 text-xs font-bold text-white shadow-[0_6px_18px_rgba(197,40,40,0.28)] hover:bg-[#B02222]"
                            >
                                <Filter className="size-3.5" />
                                <span>Terapkan Filter</span>
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
