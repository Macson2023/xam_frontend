export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ALLOWED_IMAGE_EXTENSIONS = /\.(?:jpe?g|png|gif|webp)$/i;

export function validateImageFile(file: File): string | null {
  if (file.size === 0) {
    return 'Файл пустой — выберите другое изображение.';
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `Изображение больше ${formatFileSize(MAX_IMAGE_SIZE_BYTES)}.`;
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type) && !ALLOWED_IMAGE_EXTENSIONS.test(file.name)) {
    return 'Поддерживаются только JPEG, PNG, GIF и WEBP.';
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} Б`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} КБ`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
