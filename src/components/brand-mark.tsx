import Image from "next/image";

export function BrandMark({ size = 40 }: { size?: number }) {
  return <Image src="/logo/makkah-mark-color.svg" width={size} height={size} alt="" aria-hidden="true" priority />;
}
