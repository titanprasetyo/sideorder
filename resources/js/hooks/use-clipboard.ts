// Credit: https://usehooks-ts.com/
import { useState } from 'react';

export type CopiedValue = string | null;
export type CopyFn = (text: string) => Promise<boolean>;
export type UseClipboardReturn = [CopiedValue, CopyFn];

/**
 * Menyalin teks ke clipboard dengan dukungan penuh untuk:
 * 1. Lingkungan non-HTTPS lokal (misal http://sideorder.test atau IP LAN)
 * 2. Di dalam modal Radix UI Dialog (mengatasi focus-trap FocusScope)
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
    if (typeof window === 'undefined' || !text) {
        return false;
    }

    // 1. Gunakan Clipboard API modern hanya jika berada di dalam Secure Context (HTTPS / localhost)
    if (window.isSecureContext && navigator?.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Lanjut ke fallback sinkron jika izin ditolak
        }
    }

    // 2. Fallback sinkron via textarea di dalam container fokus aktif (penting untuk Radix Dialog focus trap)
    try {
        const activeDialog = document.activeElement?.closest(
            '[role="dialog"], [data-slot="dialog-content"], [data-radix-portal]',
        ) as HTMLElement | null;
        const container = activeDialog ?? document.body;

        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.setAttribute('readonly', '');
        textArea.style.position = 'fixed';
        textArea.style.top = '0';
        textArea.style.left = '0';
        textArea.style.width = '2em';
        textArea.style.height = '2em';
        textArea.style.padding = '0';
        textArea.style.border = 'none';
        textArea.style.outline = 'none';
        textArea.style.boxShadow = 'none';
        textArea.style.background = 'transparent';
        textArea.style.opacity = '0';
        textArea.style.pointerEvents = 'none';
        textArea.style.zIndex = '-1';

        container.appendChild(textArea);

        const previouslyFocused = document.activeElement as HTMLElement | null;
        textArea.focus({ preventScroll: true });
        textArea.select();
        textArea.setSelectionRange(0, text.length);

        const successful = document.execCommand('copy');
        container.removeChild(textArea);

        if (
            previouslyFocused &&
            typeof previouslyFocused.focus === 'function'
        ) {
            previouslyFocused.focus({ preventScroll: true });
        }

        return successful;
    } catch (fallbackError) {
        console.error('Gagal menyalin teks:', fallbackError);
        return false;
    }
}

export function useClipboard(): UseClipboardReturn {
    const [copiedText, setCopiedText] = useState<CopiedValue>(null);

    const copy: CopyFn = async (text) => {
        const success = await copyTextToClipboard(text);
        if (success) {
            setCopiedText(text);
        } else {
            setCopiedText(null);
        }

        return success;
    };

    return [copiedText, copy];
}
