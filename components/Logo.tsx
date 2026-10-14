// The WakeUp Projects logo (public/logo.png). To change the logo, replace that one file.
export default function Logo({ height = 40, style }: { height?: number; style?: React.CSSProperties }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/logo.png" alt="WakeUp Projects" style={{ height, width: "auto", display: "block", ...style }} />
  );
}
