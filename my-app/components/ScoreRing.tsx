/**
 * TMDB score as a red progress ring (brand color). Pure SVG so it renders on
 * the server and costs nothing on the client.
 */
export default function ScoreRing({
  percent,
  score,
  size = 76,
}: {
  /** 0–100, drives the arc. */
  percent: number;
  /** Raw 0–10 score printed in the middle, e.g. "8.4". */
  score: string;
  size?: number;
}) {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, percent)) / 100) * circumference;

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      title={`${percent}% TMDB score`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="rgb(0 0 0 / 0.55)"
          stroke="rgb(255 255 255 / 0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#score-ring-brand)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
        />
        <defs>
          <linearGradient id="score-ring-brand" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff5c5f" />
            <stop offset="100%" stopColor="#8f0d12" />
          </linearGradient>
        </defs>
      </svg>

      <span className="absolute inset-0 flex items-center justify-center text-lg font-extrabold text-white">
        {score}
      </span>
    </div>
  );
}
