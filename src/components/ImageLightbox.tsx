import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, alt, onClose }: ImageLightboxProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
    >
      <button
        type="button"
        className="lightbox__close"
        onClick={onClose}
        aria-label="Закрыть изображение"
      >
        <CloseIcon width={22} height={22} />
      </button>
      <img
        className="lightbox__image"
        src={src}
        alt={alt}
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
