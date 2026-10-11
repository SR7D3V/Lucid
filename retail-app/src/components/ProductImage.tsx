import Image from 'next/image';

/** Product photo that fills its (positioned) parent; renders nothing when there is no image. */
export default function ProductImage({ src, alt, sizes, priority }: { src: string | null; alt: string; sizes: string; priority?: boolean }) {
  if (!src) return null;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} />;
}
