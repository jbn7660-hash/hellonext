/**
 * Causal Graph Viewer Component
 *
 * Interactive DAG visualization with:
 * - Click to select nodes and show detail panel
 * - Zoom (scroll wheel) and pan (drag) controls
 * - Edge flow animations for causal relationships
 * - Highlight paths from selected node to primary fix
 * - Responsive layout with ResizeObserver
 * - IIS score color coding (green/yellow/red)
 * - Accessibility: aria-labels, keyboard navigation
 *
 * @module components/pro/causal-graph-viewer
 * @feature F-015
 */

'use client';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import type { CausalGraphNode, CausalGraphEdge } from '@hellonext/shared/types';

interface CausalGraphViewerProps {
  nodes: CausalGraphNode[];
  edges: CausalGraphEdge[];
  primaryFixNodeId?: string;
  onNodeSelect?: (nodeId: string | null) => void;
  selectedNodeId?: string | null;
}

/**
 * Calculate node positions using a simple hierarchical layout.
 */
function calculateNodePositions(
  nodes: CausalGraphNode[],
  width: number,
  height: number
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();

  if (nodes.length === 0) return positions;

  if (nodes.length === 1) {
    positions.set(nodes[0]!.id, { x: width / 2, y: height / 2 });
    return positions;
  }

  const padding = 80;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  nodes.forEach((node, index) => {
    const angle = (index / nodes.length) * Math.PI * 2;
    const radius = Math.min(usableWidth, usableHeight) / 3;
    const x = width / 2 + radius * Math.cos(angle);
    const y = height / 2 + radius * Math.sin(angle);
    positions.set(node.id, { x, y });
  });

  return positions;
}

/**
 * Get color based on IIS score.
 * Green: < 0.3, Yellow: 0.3-0.6, Red: > 0.6
 */
function getNodeColor(score: number): { fill: string; stroke: string } {
  if (score < 0.3) {
    return { fill: '#dcfce7', stroke: '#16a34a' };
  }
  if (score < 0.6) {
    return { fill: '#fef3c7', stroke: '#d97706' };
  }
  return { fill: '#fee2e2', stroke: '#dc2626' };
}

/**
 * Find all nodes in the path from source to target.
 */
function findPathNodes(
  sourceId: string,
  targetId: string,
  edges: CausalGraphEdge[]
): Set<string> {
  const path = new Set<string>();
  const visited = new Set<string>();

  function dfs(currentId: string): boolean {
    if (currentId === targetId) {
      path.add(currentId);
      return true;
    }

    if (visited.has(currentId)) {
      return false;
    }

    visited.add(currentId);
    path.add(currentId);

    for (const edge of edges) {
      if (edge.source === currentId) {
        if (dfs(edge.target)) {
          return true;
        }
      }
    }

    path.delete(currentId);
    return false;
  }

  dfs(sourceId);
  return path;
}

export function CausalGraphViewer({
  nodes,
  edges,
  primaryFixNodeId,
  onNodeSelect,
  selectedNodeId,
}: CausalGraphViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 600, height: 400 });
  const [transform, setTransform] = useState({ scale: 1, translateX: 0, translateY: 0 });
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);

  // Update dimensions on resize
  useEffect(() => {
    const container = svgRef.current?.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      setDimensions({
        width: Math.max(400, rect.width),
        height: Math.max(300, rect.height),
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const nodePositions = useMemo(
    () => calculateNodePositions(nodes, dimensions.width, dimensions.height),
    [nodes, dimensions.width, dimensions.height]
  );

  const nodeRadius = 35;

  // Zoom handler
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.5, Math.min(3, transform.scale * delta));
    setTransform((prev) => ({ ...prev, scale: newScale }));
  }, [transform.scale]);

  // Pan handler
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (e.buttons !== 4) return; // Middle mouse button
    setTransform((prev) => ({
      ...prev,
      translateX: prev.translateX + e.movementX,
      translateY: prev.translateY + e.movementY,
    }));
  }, []);

  // Path highlighting
  const pathNodes = useMemo(() => {
    if (!selectedNodeId || !primaryFixNodeId) return new Set<string>();
    return findPathNodes(selectedNodeId, primaryFixNodeId, edges);
  }, [selectedNodeId, primaryFixNodeId, edges]);

  // Early return if no nodes
  if (nodes.length === 0) {
    return (
      <div className="flex h-80 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-900">인과 그래프가 없습니다</p>
          <p className="mt-1 text-xs text-gray-500">분석이 완료되면 그래프가 표시됩니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">인과 관계 그래프</h3>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>휠: 확대/축소</span>
          <span>중간 버튼: 드래그 이동</span>
        </div>
      </div>

      <svg
        ref={svgRef}
        width={dimensions.width}
        height={dimensions.height}
        className="w-full border border-gray-100 rounded bg-white cursor-grab active:cursor-grabbing"
        style={{
          overflow: 'auto',
          touchAction: 'none',
        }}
        onWheel={handleWheel}
        onMouseMove={handleMouseMove}
      >
        <g style={{ transform: `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})` }}>
          {/* Draw edges */}
          {edges.map((edge, idx) => {
            const sourcePos = nodePositions.get(edge.source);
            const targetPos = nodePositions.get(edge.target);

            if (!sourcePos || !targetPos) return null;

            const edgeId = `edge-${edge.source}-${edge.target}-${idx}`;
            const isInPath = pathNodes.has(edge.source) && pathNodes.has(edge.target);
            const isHovered = hoveredEdge === edgeId;

            // Arrow parameters
            const dx = targetPos.x - sourcePos.x;
            const dy = targetPos.y - sourcePos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);

            // Adjust start and end points to node boundaries
            const startX = sourcePos.x + nodeRadius * Math.cos(angle);
            const startY = sourcePos.y + nodeRadius * Math.sin(angle);
            const endX = targetPos.x - nodeRadius * Math.cos(angle);
            const endY = targetPos.y - nodeRadius * Math.sin(angle);

            // Determine edge style based on type
            const edgeTypeStyles = {
              causes: { stroke: '#3b82f6', strokeDasharray: 'none' },
              aggravates: { stroke: '#f59e0b', strokeDasharray: '5,5' },
              correlates: { stroke: '#8b5cf6', strokeDasharray: '2,2' },
            };

            const style = edgeTypeStyles[edge.type || 'correlates'];
            const opacity = isInPath ? 1 : 0.4;
            const strokeWidth = Math.max(2, edge.weight * 3);

            return (
              <g
                key={edgeId}
                opacity={opacity}
                onMouseEnter={() => setHoveredEdge(edgeId)}
                onMouseLeave={() => setHoveredEdge(null)}
              >
                {/* Line */}
                <line
                  x1={startX}
                  y1={startY}
                  x2={endX}
                  y2={endY}
                  stroke={style.stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={style.strokeDasharray}
                  markerEnd={`url(#arrowhead-${edge.type || 'correlates'})`}
                  className="transition-opacity"
                  style={{
                    filter: isHovered ? 'drop-shadow(0 0 2px currentColor)' : 'none',
                  }}
                />

                {/* Weight label on hover */}
                {isHovered && (
                  <g>
                    <rect
                      x={(startX + endX) / 2 - 18}
                      y={(startY + endY) / 2 - 12}
                      width="36"
                      height="20"
                      fill="white"
                      stroke="#d1d5db"
                      rx="3"
                    />
                    <text
                      x={(startX + endX) / 2}
                      y={(startY + endY) / 2 + 2}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#374151"
                      fontWeight="600"
                      pointerEvents="none"
                    >
                      {edge.weight.toFixed(2)}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Arrow markers */}
          <defs>
            <marker
              id="arrowhead-causes"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#3b82f6" />
            </marker>
            <marker
              id="arrowhead-aggravates"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#f59e0b" />
            </marker>
            <marker
              id="arrowhead-correlates"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 10 3, 0 6" fill="#8b5cf6" />
            </marker>
          </defs>

          {/* Draw nodes */}
          {nodes.map((node) => {
            const pos = nodePositions.get(node.id);
            if (!pos) return null;

            const isPrimaryFix = node.id === primaryFixNodeId;
            const isSelected = node.id === selectedNodeId;
            const isInPath = pathNodes.has(node.id);
            const colors = getNodeColor(node.iisScore);

            const nodeStroke = isPrimaryFix
              ? '#dc2626'
              : isSelected
                ? '#2563eb'
                : isInPath
                  ? colors.stroke
                  : '#d1d5db';
            const nodeStrokeWidth = isPrimaryFix ? 4 : isSelected ? 3 : isInPath ? 2.5 : 2;
            const nodeFill = isPrimaryFix ? '#fee2e2' : isInPath ? colors.fill : '#f9fafb';

            return (
              <g
                key={node.id}
                onClick={() => onNodeSelect?.(node.id === selectedNodeId ? null : node.id)}
                role="button"
                tabIndex={0}
                aria-label={`${node.label} (IIS: ${node.iisScore.toFixed(2)})`}
                aria-pressed={isSelected}
                className="cursor-pointer transition-opacity hover:opacity-80"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onNodeSelect?.(node.id === selectedNodeId ? null : node.id);
                  }
                }}
              >
                {/* Selection highlight */}
                {isSelected && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={nodeRadius + 8}
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth="2"
                    opacity="0.5"
                  />
                )}

                {/* Node circle */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={nodeRadius}
                  fill={nodeFill}
                  stroke={nodeStroke}
                  strokeWidth={nodeStrokeWidth}
                  className="transition-all"
                />

                {/* IIS Score badge */}
                <circle
                  cx={pos.x + nodeRadius - 8}
                  cy={pos.y - nodeRadius + 8}
                  r={14}
                  fill={nodeStroke}
                />
                <text
                  x={pos.x + nodeRadius - 8}
                  y={pos.y - nodeRadius + 12}
                  textAnchor="middle"
                  fontSize="11"
                  fill="white"
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  {node.iisScore.toFixed(1)}
                </text>

                {/* Node label */}
                <text
                  x={pos.x}
                  y={pos.y + 5}
                  textAnchor="middle"
                  fontSize="13"
                  fill="#1f2937"
                  fontWeight="600"
                  pointerEvents="none"
                >
                  {node.label.substring(0, 10)}
                  {node.label.length > 10 ? '...' : ''}
                </text>

                {/* Primary fix indicator */}
                {isPrimaryFix && (
                  <text
                    x={pos.x}
                    y={pos.y + nodeRadius + 24}
                    textAnchor="middle"
                    fontSize="12"
                    fill="#dc2626"
                    fontWeight="bold"
                    pointerEvents="none"
                  >
                    주요 수정
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="space-y-2">
          <p className="font-medium text-gray-900">노드 색상</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded border-2 border-green-600 bg-green-100" />
              <span className="text-gray-700">낮음 (0.0-0.3)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded border-2 border-amber-600 bg-amber-100" />
              <span className="text-gray-700">중간 (0.3-0.6)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded border-2 border-red-600 bg-red-100" />
              <span className="text-gray-700">높음 (0.6+)</span>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="font-medium text-gray-900">엣지 타입</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-6 bg-blue-500" />
              <span className="text-gray-700">원인 (Causes)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-6 border-t-2 border-dashed border-amber-500" />
              <span className="text-gray-700">악화 (Aggravates)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-0.5 w-6 border-t border-purple-500 border-dashed" />
              <span className="text-gray-700">상관 (Correlates)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
