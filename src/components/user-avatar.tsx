/**
 * Foto de perfil, o las iniciales si no hay. La URL viene firmada del servidor
 * (dura una hora): se pide al pintar la pagina, no se guarda.
 */
export function UserAvatar({
  name,
  url,
  className = "size-9 text-xs",
}: {
  name: string;
  url: string | null | undefined;
  className?: string;
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover`}
      />
    );
  }
  return (
    <span
      className={`brand-gradient flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}
