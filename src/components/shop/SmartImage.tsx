import { useState, type ImgHTMLAttributes } from "react";
import logoSrc from "@/assets/aelitez-logo.png";
import { imageAt, srcSet } from "@/lib/images";
import { cn } from "@/lib/utils";

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> {
  src: string;
  /** Target display width for the default `src` (responsive `srcSet` is generated when possible). */
  width?: number;
}

/** Image with responsive sources and a branded fallback if the file fails to load. */
export function SmartImage({ className, alt, src, width = 800, sizes, ...rest }: Props) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div role="img" aria-label={alt} className={cn("grid place-items-center bg-card", className)}>
        <img src={logoSrc} alt="" className="w-2/5 max-w-28 rounded-full opacity-40" />
      </div>
    );
  const set = srcSet(src);
  return (
    <img
      alt={alt}
      src={imageAt(src, width)}
      {...(set ? { srcSet: set, sizes: sizes ?? "(min-width: 1024px) 25vw, 50vw" } : {})}
      onError={() => setFailed(true)}
      className={className}
      {...rest}
    />
  );
}
