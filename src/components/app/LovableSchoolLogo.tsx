/** Display the approved Lovable artwork unchanged.
 *  The animated overlay uses an independently generated GOLD-ONLY alpha mask,
 *  never the original image alpha, so background and transparent gaps stay dark.
 */
const goldMasks = import.meta.glob("/src/assets/school-logo-gold-mask.png", {
  eager: true, query: "?url", import: "default",
});
const goldMask = goldMasks["/src/assets/school-logo-gold-mask.png"] as string | undefined;

export function LovableSchoolLogo({ logo, className = "h-28 w-28" }: { logo: string; className?: string }) {
  return <div className={`relative shrink-0 ${className}`}>
    <img src={logo} alt="شعار مدرسة العربي التبسي" className="logo-glow h-full w-full object-contain" />
    {goldMask && <span aria-hidden className="logo-shine absolute inset-0" style={{
      WebkitMaskImage: `url("${goldMask}")`, maskImage: `url("${goldMask}")`,
      WebkitMaskSize: "contain", maskSize: "contain",
      WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
      WebkitMaskPosition: "center", maskPosition: "center",
      WebkitMaskMode: "alpha", maskMode: "alpha",
    }} />}
  </div>;
}
