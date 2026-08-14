import Image from "next/image";

export function LawandOsBrand({ className = "" }: { className?: string }) {
  const classes = ["lawand-os-brand", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <span aria-hidden="true" className="lawand-os-symbol">
        <Image alt="" height={512} src="/lawand-os-mark.png" width={512} />
      </span>
      <span className="lawand-os-copy">
        <span className="lawand-os-name">
          LAW<span>&amp;</span> <strong>OS</strong>
        </span>
        <small>AI Operating System for LAW&amp;</small>
      </span>
    </span>
  );
}
