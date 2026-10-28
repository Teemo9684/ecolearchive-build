/** Exact Lovable logo layering; supply the original local school-logo.png as src. */
export function LovableSchoolLogo({ logo, className = "h-28 w-28" }: { logo: string; className?: string }) {
  return <div className={`relative shrink-0 ${className}`}>
    <img src={logo} alt="شعار مدرسة العربي التبسي" className="logo-glow h-full w-full object-contain" />
    <span aria-hidden className="logo-shine absolute inset-0" style={{
      WebkitMaskImage: `url(${logo})`, maskImage: `url(${logo})`,
      WebkitMaskSize: "contain", maskSize: "contain",
      WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
      WebkitMaskPosition: "center", maskPosition: "center"
    }} />
  </div>;
}
