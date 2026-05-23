import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { motion, AnimatePresence } from 'framer-motion';
import { SUNBURST_COLORS, formatBytes } from '@trivia-millionaire/shared';

interface SunburstNode {
  name: string;
  fullPath: string;
  messageCount: number;
  directMessageCount?: number;
  byteCount: number;
  uniqueTopics: number;
  lastArrival: number;
  depth: number;
  value?: number;
  children?: SunburstNode[];
  isOthers?: boolean;
  hiddenCount?: number;
  hasInnerMessages?: boolean;
}

interface SunburstVisualizationProps {
  data: SunburstNode | null;
  width?: number;
  height?: number;
  onNodeClick?: (path: string) => void;
  onCenterClick?: () => void;
  currentPath?: string;
  viewBy?: 'balanced' | 'messages' | 'bytes' | 'topics';
}

// Color palette inspired by explorer.solace.dev
const COLOR_PALETTE = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
  '#6366F1', // Indigo
];

export default function SunburstVisualization({
  data,
  width = 500,
  height = 500,
  onNodeClick,
  onCenterClick,
  currentPath = '',
  viewBy = 'balanced',
}: SunburstVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<SunburstNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  
  const radius = Math.min(width, height) / 2;
  const innerRadius = radius * 0.15; // Center circle
  
  // Get color for a node based on depth and index
  const getColor = useCallback((d: d3.HierarchyRectangularNode<SunburstNode>) => {
    if (d.data.isOthers) {
      return SUNBURST_COLORS.othersColor;
    }
    
    // Use depth and sibling index to pick color
    const depth = d.depth;
    const index = d.parent?.children?.indexOf(d) || 0;
    const colorIndex = (depth + index) % COLOR_PALETTE.length;
    
    // Adjust lightness for depth
    const baseColor = COLOR_PALETTE[colorIndex];
    const lightnessAdjust = Math.min(depth * 5, 20);
    
    // Parse hex and adjust
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    
    // Lighten slightly for deeper nodes
    const factor = 1 + lightnessAdjust / 100;
    const newR = Math.min(255, Math.round(r * factor));
    const newG = Math.min(255, Math.round(g * factor));
    const newB = Math.min(255, Math.round(b * factor));
    
    return `rgb(${newR}, ${newG}, ${newB})`;
  }, []);
  
  // Render sunburst
  useEffect(() => {
    if (!svgRef.current || !data) return;
    
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    
    // Create hierarchy
    const root = d3.hierarchy(data)
      .sum(d => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    
    // Create partition layout
    const partition = d3.partition<SunburstNode>()
      .size([2 * Math.PI, radius - innerRadius]);
    
    const partitioned = partition(root);
    
    // Create arc generator
    const arc = d3.arc<d3.HierarchyRectangularNode<SunburstNode>>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .padAngle(0.002)
      .padRadius(radius / 2)
      .innerRadius(d => innerRadius + d.y0)
      .outerRadius(d => innerRadius + d.y1 - 1);
    
    // Main group centered in SVG
    const g = svg.append('g')
      .attr('transform', `translate(${width / 2}, ${height / 2})`);
    
    // Add arcs
    const arcs = g.selectAll('path')
      .data(partitioned.descendants().filter(d => d.depth > 0))
      .enter()
      .append('path')
      .attr('d', arc as any)
      .attr('fill', d => getColor(d))
      .attr('stroke', d => {
        if (d.data.hasInnerMessages) return SUNBURST_COLORS.innerMessageBorder;
        if (d.data.name === '') return SUNBURST_COLORS.emptyLevelBorder;
        return 'rgba(255,255,255,0.1)';
      })
      .attr('stroke-width', d => {
        if (d.data.hasInnerMessages || d.data.name === '') return 2;
        return 0.5;
      })
      .attr('stroke-dasharray', d => d.data.hasInnerMessages ? '4,2' : 'none')
      .attr('cursor', 'pointer')
      .attr('opacity', 0.9)
      .on('mouseenter', (event, d) => {
        d3.select(event.currentTarget)
          .attr('opacity', 1)
          .attr('stroke', '#fff')
          .attr('stroke-width', 2);
        setHoveredNode(d.data);
        setTooltipPos({ x: event.pageX, y: event.pageY });
      })
      .on('mousemove', (event) => {
        setTooltipPos({ x: event.pageX, y: event.pageY });
      })
      .on('mouseleave', (event, d) => {
        d3.select(event.currentTarget)
          .attr('opacity', 0.9)
          .attr('stroke', d.data.hasInnerMessages ? SUNBURST_COLORS.innerMessageBorder : 'rgba(255,255,255,0.1)')
          .attr('stroke-width', d.data.hasInnerMessages ? 2 : 0.5);
        setHoveredNode(null);
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (!d.data.isOthers && d.children && d.children.length > 0) {
          onNodeClick?.(d.data.fullPath);
        }
      });
    
    // Add labels for larger arcs
    const minArcSize = 0.1; // Minimum arc size to show label
    g.selectAll('text')
      .data(partitioned.descendants().filter(d => 
        d.depth > 0 && (d.x1 - d.x0) > minArcSize
      ))
      .enter()
      .append('text')
      .attr('transform', d => {
        const angle = (d.x0 + d.x1) / 2;
        const r = innerRadius + (d.y0 + d.y1) / 2;
        const rotate = angle * 180 / Math.PI - 90;
        const flip = angle > Math.PI;
        return `rotate(${rotate}) translate(${r}, 0) rotate(${flip ? 180 : 0})`;
      })
      .attr('dy', '0.35em')
      .attr('text-anchor', 'middle')
      .attr('font-size', d => Math.min(11, (d.y1 - d.y0) / 3))
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .attr('font-weight', '500')
      .text(d => {
        const maxLen = Math.floor((d.y1 - d.y0) / 6);
        const name = d.data.name;
        if (name.length > maxLen) {
          return name.slice(0, maxLen - 1) + '…';
        }
        return name;
      });
    
    // Center circle with Solace branding
    const centerG = g.append('g')
      .attr('cursor', 'pointer')
      .on('click', () => onCenterClick?.());
    
    // Center background
    centerG.append('circle')
      .attr('r', innerRadius - 2)
      .attr('fill', '#1e293b')
      .attr('stroke', '#00C895')
      .attr('stroke-width', 2);
    
    // Solace "S" or logo placeholder
    centerG.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', innerRadius * 0.5)
      .attr('font-weight', 'bold')
      .attr('fill', '#00C895')
      .text('◉');
    
    // "Back" hint when drilled in
    if (currentPath) {
      centerG.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', innerRadius * 0.5)
        .attr('font-size', 10)
        .attr('fill', '#94a3b8')
        .text('← back');
    }
    
  }, [data, width, height, radius, innerRadius, getColor, onNodeClick, onCenterClick, currentPath, viewBy]);
  
  // Format number with commas
  const formatNumber = (n: number) => n.toLocaleString();
  
  return (
    <div className="relative">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        className="overflow-visible"
      />
      
      {/* Tooltip */}
      <AnimatePresence>
        {hoveredNode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed z-50 pointer-events-none"
            style={{
              left: tooltipPos.x + 15,
              top: tooltipPos.y + 15,
            }}
          >
            <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-3 max-w-xs">
              <div className="font-mono text-xs text-green-400 mb-2 break-all">
                {hoveredNode.fullPath || hoveredNode.name}
              </div>
              
              <div className="space-y-1 text-xs">
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Messages:</span>
                  <span className="text-white font-semibold">
                    {formatNumber(hoveredNode.messageCount)}
                  </span>
                </div>
                
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Bytes:</span>
                  <span className="text-white font-semibold">
                    {formatBytes(hoveredNode.byteCount)}
                  </span>
                </div>
                
                <div className="flex justify-between gap-4">
                  <span className="text-gray-400">Unique Topics:</span>
                  <span className="text-white font-semibold">
                    {formatNumber(hoveredNode.uniqueTopics)}
                  </span>
                </div>
                
                {hoveredNode.hasInnerMessages && (
                  <div className="flex justify-between gap-4 border-t border-gray-700 pt-1 mt-1">
                    <span className="text-yellow-400">Inner Msgs:</span>
                    <span className="text-yellow-400 font-semibold">
                      {formatNumber(hoveredNode.directMessageCount || 0)}
                    </span>
                  </div>
                )}
                
                {hoveredNode.isOthers && (
                  <div className="text-gray-500 text-xs mt-1 pt-1 border-t border-gray-700">
                    Contains {hoveredNode.hiddenCount} hidden topics
                  </div>
                )}
                
                {hoveredNode.lastArrival > 0 && (
                  <div className="text-gray-500 text-xs mt-1 pt-1 border-t border-gray-700">
                    Last: {new Date(hoveredNode.lastArrival).toLocaleTimeString()}
                  </div>
                )}
              </div>
              
              {!hoveredNode.isOthers && hoveredNode.uniqueTopics > 1 && (
                <div className="mt-2 pt-2 border-t border-gray-700 text-xs text-gray-400">
                  Click to drill down
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Empty state */}
      {!data && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-400">
            <div className="text-4xl mb-2">🔍</div>
            <p>No topic data yet</p>
            <p className="text-sm">Start scanning to visualize topics</p>
          </div>
        </div>
      )}
    </div>
  );
}
