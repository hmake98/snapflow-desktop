import React, { useEffect, useState } from "react";
import clsx from "clsx";

interface LocalImageProps {
  src: string;
  alt: string;
  /**
   * Optional cloud URL fallback. When the local file at `src` cannot be read
   * (missing file on a new device, deleted, etc.), the component renders an
   * <img> pointing to this URL instead of the "File not found" placeholder.
   */
  cloudFallback?: string;
  className?: string;
  style?: React.CSSProperties;
  onError?: () => void;
}

// Track logged errors to prevent spam
const loggedErrors = new Set<string>();

export const LocalImage: React.FC<LocalImageProps> = ({
  src,
  alt,
  cloudFallback,
  className = "",
  style,
  onError,
}) => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localFailed, setLocalFailed] = useState(false);
  const [cloudFailed, setCloudFailed] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadImage = async () => {
      try {
        setLoading(true);
        setLocalFailed(false);
        setCloudFailed(false);
        setDataUrl(null);

        // Skip local read entirely when src is empty/falsy — go straight to cloud.
        if (!src) {
          if (mounted) {
            setLocalFailed(true);
            setLoading(false);
          }
          return;
        }

        const result = await window.api.readImageFile(src);

        if (!mounted) return;

        if (result.success && result.data) {
          setDataUrl(result.data);
        } else {
          if (!loggedErrors.has(src)) {
            console.warn(
              `Failed to load image from ${src}:`,
              result.error || "Unknown error"
            );
            loggedErrors.add(src);
          }
          setLocalFailed(true);
          // Only call onError when there's no cloud fallback to try.
          if (!cloudFallback) onError?.();
        }
      } catch (err) {
        if (!loggedErrors.has(src)) {
          console.warn(`Error loading image from ${src}:`, err);
          loggedErrors.add(src);
        }
        if (mounted) {
          setLocalFailed(true);
          if (!cloudFallback) onError?.();
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadImage();

    return () => {
      mounted = false;
    };
  }, [src, cloudFallback]);

  if (loading) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center bg-gray-900/30 rounded-lg w-full h-full",
          className
        )}
        style={style}
      >
        <div className="flex flex-col items-center justify-center">
          <svg
            className="w-12 h-12 text-gray-600 animate-spin mb-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-sm text-gray-400">Loading image...</p>
        </div>
      </div>
    );
  }

  // Local read failed — fall back to cloud URL when one is available.
  if (localFailed && cloudFallback && !cloudFailed) {
    return (
      <img
        src={cloudFallback}
        alt={alt}
        className={clsx(className)}
        style={{
          imageRendering: "-webkit-optimize-contrast",
          ...style,
        }}
        loading="eager"
        onError={() => {
          setCloudFailed(true);
          onError?.();
        }}
      />
    );
  }

  if (localFailed || !dataUrl) {
    return (
      <div
        className={clsx(
          "flex items-center justify-center bg-gray-800 w-full h-full",
          className
        )}
        style={style}
      >
        <div className="text-center p-4">
          <svg
            className="w-12 h-12 mx-auto mb-2 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-xs text-gray-500">File not found</p>
        </div>
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt={alt}
      className={clsx(className)}
      style={{
        imageRendering: "-webkit-optimize-contrast",
        ...style,
      }}
      loading="eager"
    />
  );
};
