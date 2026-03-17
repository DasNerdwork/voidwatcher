import type { ItemData } from '../types'
import { SmallPlatIcon } from "./Icons";

interface ItemCardProps {
  item: ItemData
}

export const ItemCard: React.FC<ItemCardProps> = ({ item }) => {
  const wiki = item.wiki?.[0] || {}
  const market = item.market?.[0] || {}
  const marketName = market.market_name || wiki.name_en || wiki.name_de || '—'

  return (
    <div style={{
      background: 'rgba(10,12,32,0.82)',
      border: '1px solid rgba(200,168,75,0.22)',
      borderRadius: '8px',
      padding: '16px 20px',
      transition: 'border-color 0.15s',
      backdropFilter: 'blur(10px)',
    }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(200,168,75,0.38)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(200,168,75,0.22)')}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 700, fontSize: 15, color: '#e8dfc0' }}>
          {marketName}
        </div>
        {wiki.export_type && (
          <span style={{
            fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 9, letterSpacing: '0.15em',
            color: '#5ab4c8', background: '#5ab4c811',
            border: '1px solid #5ab4c844', borderRadius: '3px',
            padding: '2px 8px', whiteSpace: 'nowrap', marginLeft: 8,
          }}>
            {wiki.export_type.replace('Export', '')}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#7a6e52', fontFamily: 'system-ui, -apple-system, sans-serif' }}>Ø Preis</span>
          <span style={{ fontFamily: 'monospace', fontSize: 15, color: '#c8a84b', fontWeight: 700 }}>
            {market.avg_price != null ? <>{market.avg_price.toFixed(1)}<SmallPlatIcon /></> : 'N/A'}
          </span>
        </div>
        {market.min_price != null && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#7a6e52', fontFamily: 'system-ui, -apple-system, sans-serif' }}>Min / Max</span>
            {market.min_price}<SmallPlatIcon /> — {market.max_price}<SmallPlatIcon />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#7a6e52', fontFamily: 'system-ui, -apple-system, sans-serif' }}>Volumen</span>
          <span style={{ fontFamily: 'monospace', fontSize: 12, color: '#b8a97c' }}>
            {market.volume?.toLocaleString('de-DE') ?? 0}
          </span>
        </div>
        {market.last_updated && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#7a6e52', fontFamily: 'system-ui, -apple-system, sans-serif' }}>Update</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#7a6e52' }}>
              {new Date(market.last_updated).toLocaleString('de-DE')}
            </span>
          </div>
        )}
      </div>

      {wiki.raw?.health && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(200,168,75,0.22)', display: 'flex', gap: 16 }}>
          {[
            { label: 'HP', value: wiki.raw.health },
            { label: 'SH', value: wiki.raw.shield },
            { label: 'AR', value: wiki.raw.armor },
            { label: 'MR', value: wiki.raw.masteryReq },
          ].filter(s => s.value != null).map(({ label, value }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', fontSize: 9, color: '#7a6e52', letterSpacing: '0.1em' }}>{label}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 13, color: '#e8dfc0', fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}