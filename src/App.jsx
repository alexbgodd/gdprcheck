export default function App() {
  return (
    <div style={styles.wrap}>
      <div style={styles.glow} />
      <div style={styles.card}>
        <div style={styles.badge}>
          <span style={styles.dot} />
          GDPRcheck.bg
        </div>

        <h1 style={styles.headline}>Очаквайте ни скоро</h1>

        <p style={styles.sub}>
          Работим по нова, по-добра версия на инструмента за GDPR проверка.
          Ще се върнем съвсем скоро.
        </p>

        <div style={styles.barTrack}>
          <div style={styles.barFill} />
        </div>

        <a href="/risk" style={styles.riskBtn}>
          ⚠ Рискови обществени поръчки →
        </a>

        <p style={styles.footer}>
          QA &amp; Дигитален специалист · София, България
        </p>
      </div>
    </div>
  )
}

const styles = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    position: 'relative',
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: '-20%',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '600px',
    height: '600px',
    background: 'radial-gradient(circle, var(--green-dim), transparent 70%)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '16px',
    padding: '48px 36px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'var(--mono)',
    fontSize: '13px',
    letterSpacing: '0.04em',
    color: 'var(--green)',
    background: 'var(--green-dim)',
    border: '1px solid var(--green)',
    borderRadius: '999px',
    padding: '6px 14px',
    marginBottom: '28px',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: 'var(--green)',
    boxShadow: '0 0 0 0 var(--green)',
    animation: 'pulse 1.6s ease-out infinite',
  },
  headline: {
    fontFamily: 'var(--sans)',
    fontWeight: 600,
    fontSize: '32px',
    color: 'var(--text)',
    marginBottom: '16px',
    lineHeight: 1.25,
  },
  sub: {
    fontFamily: 'var(--sans)',
    fontWeight: 300,
    fontSize: '16px',
    color: 'var(--muted)',
    lineHeight: 1.6,
    marginBottom: '32px',
  },
  barTrack: {
    width: '100%',
    height: '4px',
    borderRadius: '999px',
    background: 'var(--surface2)',
    overflow: 'hidden',
    marginBottom: '28px',
  },
  barFill: {
    width: '40%',
    height: '100%',
    borderRadius: '999px',
    background: 'var(--green)',
    animation: 'slide 1.8s ease-in-out infinite',
  },
  riskBtn: {
    display: 'inline-block',
    fontFamily: 'var(--mono)',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--green)',
    background: 'var(--green-dim)',
    border: '1px solid var(--green)',
    borderRadius: '8px',
    padding: '10px 20px',
    marginBottom: '24px',
    textDecoration: 'none',
    letterSpacing: '0.02em',
    transition: 'background 0.2s',
  },
  footer: {
    fontFamily: 'var(--mono)',
    fontSize: '12px',
    color: 'var(--muted)',
    letterSpacing: '0.02em',
  },
}

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('maint-keyframes')) {
  const style = document.createElement('style')
  style.id = 'maint-keyframes'
  style.textContent = `
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 var(--green-dim); }
      70% { box-shadow: 0 0 0 8px transparent; }
      100% { box-shadow: 0 0 0 0 transparent; }
    }
    @keyframes slide {
      0% { transform: translateX(-100%); }
      50% { transform: translateX(150%); }
      100% { transform: translateX(150%); }
    }
  `
  document.head.appendChild(style)
}
