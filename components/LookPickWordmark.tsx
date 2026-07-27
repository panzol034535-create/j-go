type LookPickWordmarkProps = {
  className?: string;
};

export function LookPickWordmark({ className }: LookPickWordmarkProps) {
  return (
    <span className={["lookpick-wordmark", className].filter(Boolean).join(" ")}>
      <span className="lookpick-wordmark-look">Look</span>
      <span className="lookpick-wordmark-pick">Pick</span>
    </span>
  );
}
