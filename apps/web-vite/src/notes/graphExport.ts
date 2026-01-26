/**
 * Graph Export Utilities
 *
 * Export note graphs in various formats.
 */

import type { NoteGraph } from '@lifeos/notes'

/**
 * Export graph as JSON
 */
export function exportGraphAsJSON(graph: NoteGraph): string {
  return JSON.stringify(graph, null, 2)
}

/**
 * Export graph as GraphML (for Gephi, Cytoscape)
 */
export function exportGraphAsGraphML(graph: NoteGraph): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += '<graphml xmlns="http://graphml.graphdrawing.org/xmlns">\n'
  xml += '  <graph id="note-graph" edgedefault="directed">\n'

  // Add nodes
  for (const node of graph.nodes) {
    xml += `    <node id="${node.noteId}">\n`
    xml += `      <data key="label">${escapeXml(node.title)}</data>\n`
    xml += `      <data key="linkCount">${node.linkCount}</data>\n`
    xml += `      <data key="backlinkCount">${node.backlinkCount}</data>\n`
    xml += '    </node>\n'
  }

  // Add edges
  for (const edge of graph.edges) {
    xml += `    <edge source="${edge.fromNoteId}" target="${edge.toNoteId}">\n`
    xml += `      <data key="type">${edge.edgeType}</data>\n`
    xml += '    </edge>\n'
  }

  xml += '  </graph>\n'
  xml += '</graphml>'

  return xml
}

/**
 * Export graph as Mermaid diagram code
 */
export function exportGraphAsMermaid(graph: NoteGraph): string {
  let mermaid = 'graph TD\n'

  // Add nodes
  for (const node of graph.nodes) {
    const nodeId = node.noteId.replace(/[^a-zA-Z0-9]/g, '_')
    const label = node.title.replace(/"/g, '&quot;')
    mermaid += `  ${nodeId}["${label}"]\n`
  }

  // Add edges
  for (const edge of graph.edges) {
    const fromId = edge.fromNoteId.replace(/[^a-zA-Z0-9]/g, '_')
    const toId = edge.toNoteId.replace(/[^a-zA-Z0-9]/g, '_')
    const style = edge.edgeType === 'explicit_link' ? '-->' : '-.->'
    mermaid += `  ${fromId}${style}${toId}\n`
  }

  return mermaid
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
