/**
 * Filter Panel
 *
 * Controls for filtering the knowledge graph by layer, node type, and temporal state.
 * Also displays the edge type legend.
 */

import type { FilterPanelProps, KGNodeType, KGEdgeType } from './types'
import { NODE_TYPE_CONFIG, EDGE_TYPE_CONFIG, LAYER_NAMES, ALL_LAYERS } from './types'
import { formatEdgeLabel } from './utils'

export function FilterPanel({
  visibleLayers,
  visibleNodeTypes,
  temporalFilter,
  onToggleLayer,
  onToggleNodeType,
  onTemporalFilterChange,
}: FilterPanelProps) {
  return (
    <aside className="kg-filters" role="complementary" aria-label="Graph filters">
      {/* Layer Filters */}
      <section className="filter-section">
        <h4>Layers</h4>
        <div className="filter-options">
          {ALL_LAYERS.map((layer) => (
            <label key={layer} className="filter-option">
              <input
                type="checkbox"
                checked={visibleLayers.has(layer)}
                onChange={() => onToggleLayer(layer)}
              />
              <span>{LAYER_NAMES[layer]}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Node Type Filters */}
      <section className="filter-section">
        <h4>Node Types</h4>
        <div className="filter-options">
          {(
            Object.entries(NODE_TYPE_CONFIG) as [
              KGNodeType,
              (typeof NODE_TYPE_CONFIG)[KGNodeType],
            ][]
          ).map(([type, config]) => (
            <label key={type} className="filter-option">
              <input
                type="checkbox"
                checked={visibleNodeTypes.has(type)}
                onChange={() => onToggleNodeType(type)}
              />
              <span className="filter-icon" aria-hidden="true">
                {config.icon}
              </span>
              <span>{type}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Temporal Filter */}
      <section className="filter-section">
        <h4>Temporal</h4>
        <div className="filter-options" role="radiogroup" aria-label="Temporal filter">
          <label className="filter-option">
            <input
              type="radio"
              name="temporal"
              checked={temporalFilter === 'active'}
              onChange={() => onTemporalFilterChange('active')}
            />
            <span>Active only</span>
          </label>
          <label className="filter-option">
            <input
              type="radio"
              name="temporal"
              checked={temporalFilter === 'all'}
              onChange={() => onTemporalFilterChange('all')}
            />
            <span>All nodes</span>
          </label>
          <label className="filter-option">
            <input
              type="radio"
              name="temporal"
              checked={temporalFilter === 'expired'}
              onChange={() => onTemporalFilterChange('expired')}
            />
            <span>Expired only</span>
          </label>
        </div>
      </section>

      {/* Legend */}
      <section className="filter-section">
        <h4>Edge Types</h4>
        <div className="legend-items">
          {(
            Object.entries(EDGE_TYPE_CONFIG) as [
              KGEdgeType,
              (typeof EDGE_TYPE_CONFIG)[KGEdgeType],
            ][]
          ).map(([type, config]) => (
            <div key={type} className="legend-item">
              <span
                className="legend-line"
                style={{
                  background: config.color,
                  opacity: config.dashed ? 0.7 : 1,
                }}
                aria-hidden="true"
              />
              <span className="legend-label">{formatEdgeLabel(type)}</span>
            </div>
          ))}
        </div>
      </section>
    </aside>
  )
}

export default FilterPanel
