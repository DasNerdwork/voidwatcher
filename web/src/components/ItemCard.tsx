import type { ItemData } from '../types'

interface ItemCardProps {
  item: ItemData
}

export const ItemCard: React.FC<ItemCardProps> = ({ item }) => {
  const wiki = item.wiki?.[0] || {}
  const market = item.market?.[0] || {}
  const marketName = market.market_name || wiki.name_en || wiki.name_de || '—'

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '16px 20px',
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--plat-dim)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>
          {marketName}
        </div>
        {wiki.export_type && (
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 9, letterSpacing: '0.15em',
            color: 'var(--cyan)', background: '#06B6D411',
            border: '1px solid var(--cyan-dim)', borderRadius: 3,
            padding: '2px 8px', whiteSpace: 'nowrap', marginLeft: 8,
          }}>
            {wiki.export_type.replace('Export', '')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Ø Preis</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--plat)', fontWeight: 700 }}>
            {market.avg_price != null ? `${market.avg_price.toFixed(1)} ₱` : 'N/A'}
          </span>
        </div>
        {market.min_price != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Min / Max</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              {market.min_price} — {market.max_price} ₱
            </span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Volumen</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
            {market.volume?.toLocaleString('de-DE') ?? 0}
          </span>
        </div>
        {market.last_updated && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Update</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
              {new Date(market.last_updated).toLocaleString('de-DE')}
            </span>
          </div>
        )}
      </div>

      {wiki.raw?.health && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16 }}>
          {[
            { label: 'HP', value: wiki.raw.health },
            { label: 'SH', value: wiki.raw.shield },
            { label: 'AR', value: wiki.raw.armor },
            { label: 'MR', value: wiki.raw.masteryReq },
          ].filter(s => s.value != null).map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}