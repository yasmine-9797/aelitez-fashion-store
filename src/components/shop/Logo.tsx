import logoSrc from "@/assets/aelitez-logo.png";
import { cn } from "@/lib/utils";

type Tone = "light" | "dark";

/** Circular AELITEZ logo. Size it with `className` (e.g. `size-12`). */
export function Logo({ className, alt = "AELITEZ CLOTHINGS" }: { className?: string; alt?: string }) {
  return <img src={logoSrc} alt={alt} width={148} height={148} draggable={false} className={cn("inline-block aspect-square shrink-0 rounded-full bg-paper", className)} />;
}

/** Text wordmark coloured like the logo: black A, red ELITE, black Z. */
export function Wordmark({ className, tone = "light", sub = true }: { className?: string; tone?: Tone; sub?: boolean }) {
  return (
    <span className={cn("flex flex-col", className)}>
      <span className={cn("display", tone === "dark" ? "text-paper" : "text-ink")}>
        A<span className="text-brand">elite</span>z
      </span>
      {sub && <span className={cn("mt-[0.3em] text-[0.3em] font-bold uppercase leading-none tracking-[0.5em]", tone === "dark" ? "text-paper/60" : "text-muted-foreground")}>Clothings</span>}
    </span>
  );
}
