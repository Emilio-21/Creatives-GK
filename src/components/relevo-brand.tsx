import Link from "next/link";

/**
 * El logo de Relevo: el simbolo (la estafeta que pasa de mano en mano, ver
 * scripts/logo.mjs) y la palabra en la tipografia de los titulos.
 */
/**
 * El simbolo en linea (no <img>) para que tome el color del texto: sobre el
 * fondo naranja de la app, el naranja de marca desaparece. Misma geometria que
 * genera scripts/logo.mjs — si cambia alla, se copia aqui.
 */
export function RelevoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden="true">
      <defs>
        <mask id="relevo-muesca" maskUnits="userSpaceOnUse" x="-400" y="-400" width="800" height="800">
          <rect x="-400" y="-400" width="800" height="800" fill="#fff" />
          <circle cx="24" cy="-60" r="62" fill="#000" />
        </mask>
      </defs>
      <g
        fill="currentColor"
        transform="translate(256 256) scale(1.0818) translate(-12.37 0.35) rotate(-45)"
      >
        <g mask="url(#relevo-muesca)">
          <rect x="-134" y="-108" width="160" height="96" rx="48" />
        </g>
        <rect x="-24" y="-108" width="227" height="96" rx="48" />
        <rect x="-202" y="12" width="371" height="96" rx="48" />
      </g>
    </svg>
  );
}

export function RelevoBrand({
  size = "md",
  wordmark = true,
  tone = "current",
  href,
}: {
  size?: "sm" | "md" | "lg";
  /** Sin la palabra: solo el simbolo, para donde no cabe. */
  wordmark?: boolean;
  /** "brand": naranja, sobre paneles. "current": color del texto, sobre el fondo. */
  tone?: "brand" | "current";
  href?: string;
}) {
  const mark = { sm: "size-6", md: "size-7", lg: "size-11" }[size];
  const text = { sm: "text-lg", md: "text-2xl", lg: "text-5xl" }[size];

  const contenido = (
    <>
      <RelevoMark className={`${mark} shrink-0 ${tone === "brand" ? "text-[#BE3D0D]" : ""}`} />
      {!wordmark ? <span className="sr-only">Relevo</span> : null}
      {wordmark ? (
        <span className={`font-heading font-extralight tracking-tight ${text}`}>Relevo</span>
      ) : null}
    </>
  );

  return href ? (
    <Link href={href} className="flex items-center gap-2">
      {contenido}
    </Link>
  ) : (
    <span className="flex items-center gap-2">{contenido}</span>
  );
}
