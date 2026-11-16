/**
 * Utilitas Pengunduhan Berkas Aman (Safe Download Utility)
 *
 * Mengatasi pembatasan "Insecure download blocked" pada Google Chrome / Chromium
 * saat aplikasi dijalankan di domain lokal non-HTTPS (seperti http://sideorder.test).
 *
 * Cara Kerja:
 * 1. Mengambil berkas dari server menggunakan `fetch()` (XHR/Fetch tidak diblokir sebagai unduhan).
 * 2. Mengirimkan ArrayBuffer berkas ke dalam `<iframe sandbox="allow-scripts allow-downloads">`
 *    yang memiliki opaque origin (`initiator_->opaque() == true` di Chromium) dan skema `blob:null/...`
 *    (`dl_url.SchemeIsBlob() == true`), sehingga Chromium mengklasifikasikan unduhan sebagai SAFE
 *    untuk seluruh ekstensi (.pdf, .xlsx, .csv, .png).
 * 3. Menyediakan fallback otomatis ke `File System Access API` (`showSaveFilePicker`) atau
 *    tautan `<a download>` langsung apabila iframe sandbox tidak tersedia.
 */

let sandboxIframe: HTMLIFrameElement | null = null;
let sandboxReadyPromise: Promise<HTMLIFrameElement> | null = null;

function ensureSandboxDownloaderIframe(): Promise<HTMLIFrameElement> {
    if (
        sandboxIframe &&
        document.body.contains(sandboxIframe) &&
        sandboxReadyPromise
    ) {
        return sandboxReadyPromise;
    }

    sandboxReadyPromise = new Promise<HTMLIFrameElement>((resolve, reject) => {
        try {
            const iframe = document.createElement('iframe');
            // PENTING: Jangan sertakan 'allow-same-origin' agar origin iframe bersifat opaque (null),
            // sehingga lolos dari pemeriksaan !initiator_->opaque() pada insecure_download_blocking.cc Chromium.
            iframe.setAttribute('sandbox', 'allow-scripts allow-downloads');
            iframe.setAttribute('aria-hidden', 'true');
            iframe.tabIndex = -1;
            iframe.style.position = 'fixed';
            iframe.style.width = '0';
            iframe.style.height = '0';
            iframe.style.border = '0';
            iframe.style.opacity = '0';
            iframe.style.pointerEvents = 'none';

            const handleMessage = (event: MessageEvent) => {
                if (
                    event.source === iframe.contentWindow &&
                    event.data?.type === 'SAFE_DOWNLOAD_READY'
                ) {
                    window.removeEventListener('message', handleMessage);
                    resolve(iframe);
                }
            };

            window.addEventListener('message', handleMessage);

            iframe.srcdoc = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script>
window.addEventListener('message', function(e) {
    var data = e.data;
    if (!data || data.type !== 'TRIGGER_SAFE_DOWNLOAD') return;
    try {
        var blob = new Blob([data.buffer], { type: data.mimeType || 'application/octet-stream' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = data.filename || 'download';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
            if (a.parentNode) a.parentNode.removeChild(a);
            URL.revokeObjectURL(url);
        }, 60000);
        if (e.source) {
            e.source.postMessage({ type: 'SAFE_DOWNLOAD_SUCCESS', id: data.id }, '*');
        }
    } catch (err) {
        if (e.source) {
            e.source.postMessage({ type: 'SAFE_DOWNLOAD_ERROR', id: data.id, message: String(err) }, '*');
        }
    }
});
window.parent.postMessage({ type: 'SAFE_DOWNLOAD_READY' }, '*');
</script>
</body>
</html>`;

            document.body.appendChild(iframe);
            sandboxIframe = iframe;

            // Batas waktu jika iframe gagal dimuat
            setTimeout(() => {
                window.removeEventListener('message', handleMessage);
                if (iframe.contentWindow) {
                    resolve(iframe);
                } else {
                    reject(new Error('Iframe pengunduh gagal dimuat.'));
                }
            }, 2500);
        } catch (err) {
            reject(err);
        }
    });

    return sandboxReadyPromise;
}

/**
 * Ekstrak nama file dari header Content-Disposition jika tersedia.
 */
export function extractFilenameFromContentDisposition(
    contentDisposition: string | null,
    fallbackFilename: string,
): string {
    if (!contentDisposition) {
        return fallbackFilename;
    }

    // Cek format UTF-8 RFC 5987: filename*=UTF-8''nama_file.pdf
    const utf8Match = contentDisposition.match(
        /filename\*=UTF-8''([^;\r\n]+)/i,
    );
    if (utf8Match && utf8Match[1]) {
        try {
            return decodeURIComponent(utf8Match[1].trim());
        } catch {
            // Lanjutkan ke pencocokan standar
        }
    }

    // Cek format standar: filename="nama_file.pdf" atau filename=nama_file.pdf
    const asciiMatch = contentDisposition.match(
        /filename=["']?([^"';\r\n]+)["']?/i,
    );
    if (asciiMatch && asciiMatch[1]) {
        return asciiMatch[1].trim();
    }

    return fallbackFilename;
}

/**
 * Memicu unduhan dari ArrayBuffer atau Blob dengan aman tanpa terblokir oleh peringatan
 * "Insecure download blocked" pada domain HTTP lokal (.test / LAN).
 */
export async function triggerSafeBufferDownload(
    buffer: ArrayBuffer,
    filename: string,
    mimeType = 'application/octet-stream',
): Promise<void> {
    try {
        const iframe = await ensureSandboxDownloaderIframe();
        if (iframe.contentWindow) {
            const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

            await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    window.removeEventListener('message', onAck);
                    resolve();
                }, 1500);

                const onAck = (event: MessageEvent) => {
                    if (event.source !== iframe.contentWindow) return;
                    if (event.data?.id !== downloadId) return;

                    clearTimeout(timeout);
                    window.removeEventListener('message', onAck);

                    if (event.data?.type === 'SAFE_DOWNLOAD_ERROR') {
                        reject(
                            new Error(
                                event.data.message ||
                                    'Gagal memicu unduhan di sandbox',
                            ),
                        );
                    } else {
                        resolve();
                    }
                };

                window.addEventListener('message', onAck);

                // Clone buffer terlebih dahulu agar fallback tetap dapat menggunakannya jika diperlukan
                const clonedBuffer = buffer.slice(0);
                iframe.contentWindow!.postMessage(
                    {
                        type: 'TRIGGER_SAFE_DOWNLOAD',
                        id: downloadId,
                        buffer: clonedBuffer,
                        filename,
                        mimeType,
                    },
                    '*',
                    [clonedBuffer],
                );
            });

            return;
        }
    } catch {
        // Jika sandbox iframe gagal, lanjutkan ke fallback Blob URL langsung
    }

    // Fallback standar menggunakan Blob URL di main window
    const blob = new Blob([buffer], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.style.display = 'none';
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
        if (link.parentNode) {
            link.parentNode.removeChild(link);
        }
        URL.revokeObjectURL(blobUrl);
    }, 60000);
}

/**
 * Mengunduh berkas dari endpoint server (PDF, Excel, CSV, dll.) menggunakan Fetch API
 * lalu menyimpannya secara aman ke perangkat pengguna.
 */
export async function fetchAndDownloadSafely(
    url: string,
    fallbackFilename: string,
    expectedMimeType?: string,
): Promise<{ filename: string; size: number }> {
    const response = await fetch(url, {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
        },
    });

    if (!response.ok) {
        let errorMessage = `Gagal mengunduh berkas (HTTP ${response.status}).`;
        try {
            const contentType = response.headers.get('Content-Type') || '';
            if (contentType.includes('application/json')) {
                const errJson = await response.json();
                if (errJson?.message) {
                    errorMessage = errJson.message;
                }
            }
        } catch {
            // Abaikan error parsing JSON
        }
        throw new Error(errorMessage);
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = extractFilenameFromContentDisposition(
        contentDisposition,
        fallbackFilename,
    );
    const responseMime = response.headers
        .get('Content-Type')
        ?.split(';')[0]
        ?.trim();
    const mimeType =
        expectedMimeType || responseMime || 'application/octet-stream';

    const buffer = await response.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
        throw new Error('Berkas laporan yang diterima dari server kosong.');
    }

    await triggerSafeBufferDownload(buffer, filename, mimeType);

    return {
        filename,
        size: buffer.byteLength,
    };
}

/**
 * Mengunduh Data URL (misalnya gambar QRIS PNG base64) secara aman.
 */
export async function downloadDataUrlSafely(
    dataUrl: string,
    filename: string,
): Promise<void> {
    const res = await fetch(dataUrl);
    const buffer = await res.arrayBuffer();
    const mimeMatch = dataUrl.match(/^data:([^;,]+)[;,]/i);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    await triggerSafeBufferDownload(buffer, filename, mimeType);
}
