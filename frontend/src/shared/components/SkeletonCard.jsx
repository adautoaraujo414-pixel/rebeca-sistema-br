export function SkeletonCard() {
  return (
    <div style={{
      background:   'var(--color-surface)',
      border:       '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding:      'var(--space-5)',
      display:      'flex',
      flexDirection:'column',
      gap:          'var(--space-3)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Shimmer width="40%" height="12px" />
        <Shimmer width={34} height={34} radius="var(--radius-md)" />
      </div>
      <Shimmer width="60%" height="28px" />
      <Shimmer width="80%" height="12px" />
    </div>
  );
}

function Shimmer({ width, height, radius = 'var(--radius-sm)' }) {
  return (
    <div style={{
      width, height,
      borderRadius: radius,
      background: 'linear-gradient(90deg, var(--color-border) 25%, var(--color-border-2) 50%, var(--color-border) 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
    }} />
  );
}
