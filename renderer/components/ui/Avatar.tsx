import React, { useEffect, useState } from "react";
import clsx from "clsx";

interface AvatarProps {
  /** URL of the avatar image. When absent or fails to load, an initials
   *  gradient is rendered instead. */
  src?: string | null;
  /** Display name — used to derive initials and as alt text. */
  name?: string | null;
  /** Email — fallback for initials when name is empty. */
  email?: string | null;
  /** Pixel size of the rounded square. */
  size?: number;
  /** Tailwind text-* class for the initials. Defaults are picked by size. */
  textClassName?: string;
  className?: string;
}

function getInitials(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "?";

  // For an email like "harsh.make1998@gmail.com" — take the local part
  const local = trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;

  const parts = local
    .split(/[.\s_\-+]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return trimmed[0]?.toUpperCase() ?? "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function defaultTextClass(size: number): string {
  if (size <= 24) return "text-2xs";
  if (size <= 32) return "text-xs";
  if (size <= 48) return "text-sm";
  return "text-base";
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  email,
  size = 32,
  textClassName,
  className,
}) => {
  const [failed, setFailed] = useState(false);

  // Reset failure state when the src changes (e.g. user uploads a new avatar).
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const initials = getInitials(name || email || "");
  const showImage = !!src && !failed;

  const dimension: React.CSSProperties = { width: size, height: size };

  if (showImage) {
    return (
      <img
        src={src!}
        alt={name ?? email ?? "Avatar"}
        style={dimension}
        className={clsx(
          "rounded-full object-cover ring-2 ring-gray-700/60 flex-shrink-0",
          className
        )}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={dimension}
      className={clsx(
        "rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-semibold flex-shrink-0 select-none",
        textClassName ?? defaultTextClass(size),
        className
      )}
      aria-label={name ?? email ?? "Avatar"}
    >
      {initials}
    </div>
  );
};
