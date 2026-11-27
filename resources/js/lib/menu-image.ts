/**
 * Resolusi URL gambar menu secara konsisten (mendukung endpoint persisten Laravel Cloud `/menu-images/...`,
 * URL Object Storage/S3, maupun path relatif `menus/...`).
 */
export function resolveMenuImageUrl(menu: {
    image_url?: string | null;
    image_path?: string | null;
}): string | null {
    const directUrl = menu.image_url?.trim();
    if (directUrl) {
        return directUrl;
    }

    const rawPath = menu.image_path?.trim();
    if (!rawPath) {
        return null;
    }

    if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
        return rawPath;
    }

    if (rawPath.startsWith('/menu-images/') || rawPath.startsWith('/images/')) {
        return rawPath;
    }

    const normalized = rawPath
        .replace(/^\/+/, '')
        .replace(/^storage\//, '')
        .replace(/^menus\//, '');

    if (!normalized || normalized.includes('..')) {
        return null;
    }

    return `/menu-images/${normalized
        .split('/')
        .map((segment) => encodeURIComponent(segment))
        .join('/')}`;
}
