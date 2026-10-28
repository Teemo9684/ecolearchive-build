/** Exact Lovable logo layering; supply the original local school-logo.png as src. */
export function LovableSchoolLogo({ logo }: { logo: string }) {
  return <div className="relative h-28 w-28">
    <img src={logo} alt="شعار مدرسة العربي التبسي" width={112} height={112} className="logo-glow h-28 w-28 object-contain" />
    <span aria-hidden className="logo-shine absolute inset-0" style={{
      WebkitMaskImage: `url(${logo})`, maskImage: `url(${logo})`,
      WebkitMaskSize: "contain", maskSize: "contain",
      WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat",
      WebkitMaskPosition: "center", maskPosition: "center"
    }} />
  </div>;
}
