import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { Trash2, Plus, GripHorizontal, MousePointer2, ZoomIn, ZoomOut, Maximize, Download, Move, LayoutTemplate, Copy, Check, AlertTriangle } from 'lucide-react';
import dagre from 'dagre';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

// --- Advanced Parser & Generator ---
const parseMermaid = (code, existingNodes) => {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%'));
  const nodesMap = {};
  const edges = [];
  const subgraphs = {};
  const classDefs = {};
  let graphDirection = 'TB';

  const subgraphStack = [];
  let currentSubgraph = null;
  let edgeCounter = 0;
  let newNodeIndex = 0;

  const getOrCreateNode = (id, label = null, shape = null) => {
    if (!nodesMap[id]) {
      const ex = existingNodes.find(n => n.id === id);
      nodesMap[id] = {
        id,
        label: label || id,
        shape: shape || 'default',
        x: ex?.x ?? (100 + (newNodeIndex % 5) * 200),
        y: ex?.y ?? (100 + Math.floor(newNodeIndex / 5) * 150),
        fill: ex?.fill || '#ffffff',
        color: ex?.color || '#1e293b',
        stroke: ex?.stroke || '#cbd5e1',
        strokeWidth: ex?.strokeWidth || '2px',
        subgraph: currentSubgraph
      };
      newNodeIndex++;
    } else {
      if (label && label !== id) nodesMap[id].label = label;
      if (shape) nodesMap[id].shape = shape;
      if (currentSubgraph && !nodesMap[id].subgraph) nodesMap[id].subgraph = currentSubgraph;
    }
    return nodesMap[id];
  };

  // Supports: id[text], id(text), id{text}, id[(text)], id([text]), id((text)), id>text]
  const parseNodeDef = (str) => {
    const m = str.match(/^([a-zA-Z0-9_]+)([\[\(\{<][\[\(\{]?)\s*(?:")?(.*?)(?:")?\s*([\]\)\}>][\]\)\}>]?)$/);
    if (!m) return null;
    const id = m[1];
    const open = m[2];
    const label = m[3];
    let shape = 'default';
    if (open === '(' || open === '([') shape = 'round';
    else if (open === '((') shape = 'round';
    else if (open === '{') shape = 'diamond';
    else if (open === '[(') shape = 'cylinder';
    else if (open === '[') shape = 'default';
    return { id, label: label || id, shape };
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Parse graph/flowchart declaration with direction
    if (line.startsWith('graph') || line.startsWith('flowchart')) {
      const dirMatch = line.match(/(?:graph|flowchart)\s+(TB|BT|LR|RL|TD)/i);
      if (dirMatch) graphDirection = dirMatch[1].toUpperCase();
      continue;
    }

    // Parse standalone direction
    if (line.startsWith('direction')) {
      const dirMatch = line.match(/direction\s+(TB|BT|LR|RL|TD)/i);
      if (dirMatch) graphDirection = dirMatch[1].toUpperCase();
      continue;
    }

    const subgraphMatch = line.match(/^subgraph\s+([a-zA-Z0-9_]+)(?:\[(?:")?(.*?)(?:")?\])?/);
    if (subgraphMatch) {
      const sgId = subgraphMatch[1];
      const parentSg = subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : null;

      subgraphs[sgId] = { id: sgId, label: subgraphMatch[2] || sgId, parent: parentSg };
      subgraphStack.push(sgId);
      currentSubgraph = sgId;
      continue;
    }

    if (line === 'end') {
      subgraphStack.pop();
      currentSubgraph = subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : null;
      continue;
    }

    const classDefMatch = line.match(/^classDef\s+([a-zA-Z0-9_]+)\s+(.+)/);
    if (classDefMatch) {
      const className = classDefMatch[1];
      const styles = {};
      classDefMatch[2].split(',').forEach(s => {
        const [k, v] = s.split(':').map(x => x.trim());
        if (k === 'fill') styles.fill = v;
        if (k === 'color') styles.color = v;
        if (k === 'stroke') styles.stroke = v;
        if (k === 'stroke-width') styles.strokeWidth = v;
      });
      classDefs[className] = styles;
      continue;
    }

    const classAssignMatch = line.match(/^class\s+([a-zA-Z0-9_,\s]+)\s+([a-zA-Z0-9_]+)/);
    if (classAssignMatch) {
      const ids = classAssignMatch[1].split(',').map(id => id.trim());
      const className = classAssignMatch[2];
      const styles = classDefs[className];
      if (styles) {
        ids.forEach(id => {
          if (nodesMap[id]) Object.assign(nodesMap[id], styles);
          else { getOrCreateNode(id); Object.assign(nodesMap[id], styles); }
        });
      }
      continue;
    }

    const edgeMatch = line.match(/^(.*?)\s*(-->|---|-.->|==>)\s*(?:\|(?:")?(.*?)(?:")?\|)?\s*(.*)$/);
    if (edgeMatch) {
      const srcStr = edgeMatch[1].trim();
      const edgeLabel = edgeMatch[3] ? String(edgeMatch[3]) : '';
      let targetsStr = edgeMatch[4].trim();

      const nextArrowMatch = targetsStr.match(/^(.*?)\s+(-->|---|-.->|==>)\s+(.*)$/);
      if (nextArrowMatch) {
        const intermediateTarget = nextArrowMatch[1].trim();
        lines.push(intermediateTarget + ' ' + nextArrowMatch[2] + ' ' + nextArrowMatch[3]);
        targetsStr = intermediateTarget;
      }

      let srcId = srcStr;
      const sParsed = parseNodeDef(srcStr);
      if (sParsed) { srcId = sParsed.id; getOrCreateNode(srcId, sParsed.label, sParsed.shape); }
      else getOrCreateNode(srcId);

      const targets = targetsStr.split('&').map(t => t.trim());
      targets.forEach(tgtStr => {
        let tgtId = tgtStr;
        const tParsed = parseNodeDef(tgtStr);
        if (tParsed) { tgtId = tParsed.id; getOrCreateNode(tgtId, tParsed.label, tParsed.shape); }
        else getOrCreateNode(tgtId);

        edges.push({ id: `e${edgeCounter++}`, source: srcId, target: tgtId, label: edgeLabel });
      });
      continue;
    }

    const parsed = parseNodeDef(line);
    if (parsed) getOrCreateNode(parsed.id, parsed.label, parsed.shape);
  }

  const newNodes = Object.values(nodesMap).filter(n => !subgraphs[n.id]);
  return { newNodes, newEdges: edges, subgraphs, graphDirection };
};

const generateMermaid = (nodes, edges, subgraphs, graphDirection = 'TB') => {
  let code = `flowchart ${graphDirection}\n\n`;

  const writeNode = (n) => {
    let open = '[', close = ']';
    if (n.shape === 'round') { open = '('; close = ')'; }
    if (n.shape === 'diamond') { open = '{'; close = '}'; }
    if (n.shape === 'cylinder') { open = '[('; close = ')]'; }
    const safeLabel = String(n.label || n.id).replace(/"/g, "'");
    return `${n.id}${open}"${safeLabel}"${close}\n`;
  };

  const writeSubgraph = (sgId, indentLevel) => {
    const indent = "  ".repeat(indentLevel);
    const sg = subgraphs[sgId];
    let res = `${indent}subgraph ${sgId}["${sg.label}"]\n`;

    Object.keys(subgraphs).filter(k => subgraphs[k].parent === sgId).forEach(childId => {
      res += writeSubgraph(childId, indentLevel + 1);
    });

    nodes.filter(n => n.subgraph === sgId).forEach(n => {
      res += indent + '  ' + writeNode(n);
    });

    res += `${indent}end\n\n`;
    return res;
  };

  Object.keys(subgraphs).filter(k => !subgraphs[k].parent).forEach(sgId => {
    code += writeSubgraph(sgId, 1);
  });

  nodes.filter(n => !n.subgraph).forEach(n => { code += '  ' + writeNode(n); });
  code += "\n";

  edges.forEach(e => {
    const edgeStr = e.label ? `-->|"${e.label}"|` : `-->`;
    code += `  ${e.source} ${edgeStr} ${e.target}\n`;
  });

  code += "\n  %% Custom Styles\n";
  nodes.forEach(n => {
    if (n.fill !== '#ffffff' || n.color !== '#1e293b' || n.stroke !== '#cbd5e1') {
      code += `  style ${n.id} fill:${n.fill},color:${n.color},stroke:${n.stroke},stroke-width:${n.strokeWidth}\n`;
    }
  });

  return code;
};

const defaultCode = `flowchart TB

  %% Welcome to Mermaid Visual Editor Pro
  subgraph Section_1["Section 1: Data"]
    DB1[(Database)]
    API1(External API)
  end

  subgraph Section_2["Section 2: Processing"]
    P1{Process Data?}
    P2[Save to Cloud]
  end

  DB1 --> P1
  API1 --> P1
  P1 -->|"Yes"| P2
`;

// --- Helper: compute node dimensions ---
const getNodeDimensions = (label) => {
  const lines = String(label || '').split(/<br\s*\/?>/i);
  // Better width estimation: measure each char, Unicode chars like • are wider
  const measureLine = (line) => {
    let w = 0;
    for (const ch of line) {
      if (ch.charCodeAt(0) > 127) w += 10; // Unicode chars
      else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) w += 8.5; // uppercase
      else w += 7.5; // normal
    }
    return w;
  };
  const maxLineWidth = Math.max(...lines.map(measureLine));
  const width = Math.max(160, maxLineWidth + 32);
  const height = Math.max(60, lines.length * 22 + 24);
  return { width, height, lines };
};

// --- Escape HTML for SVG ---
const escapeHtml = (str) => String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// --- Memoized Node Component ---
const NodeComponent = memo(function NodeComponent({ node, isSelected, onMouseDown, onStartDrawEdge, formatLabel }) {
  let shapeStyles = { borderRadius: '8px' };
  if (node.shape === 'round') shapeStyles = { borderRadius: '9999px' };
  if (node.shape === 'cylinder') shapeStyles = { borderRadius: '8px 8px 50% 50%' };
  if (node.shape === 'diamond') shapeStyles = { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', padding: '40px 30px', minWidth: '160px' };

  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.id)}
      style={{
        position: 'absolute',
        left: node.x, top: node.y,
        transform: 'translate(-50%, -50%)',
        backgroundColor: node.fill,
        color: node.color,
        borderColor: isSelected ? '#3b82f6' : node.stroke,
        borderWidth: isSelected ? '3px' : node.strokeWidth,
        ...shapeStyles
      }}
      className={`
        cursor-move min-w-[140px] min-h-[60px] p-4 text-center select-none flex items-center justify-center text-sm font-medium border-solid transition-colors shadow-md z-20 hover:shadow-lg
        ${isSelected ? 'shadow-blue-200 shadow-xl z-30 ring-4 ring-blue-100' : ''}
      `}
    >
      <div>{formatLabel(node.label)}</div>

      {isSelected && (
        <div
          className="absolute top-1/2 -right-4 transform -translate-y-1/2 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center cursor-crosshair shadow-lg hover:bg-blue-600 hover:scale-110 transition-all z-40"
          onMouseDown={(e) => onStartDrawEdge(e, node.id)}
          title="Drag to another node to connect"
        >
          <Plus size={18} strokeWidth={3} />
        </div>
      )}
      {isSelected && (
        <div className="absolute -top-3 -left-3 bg-white p-1.5 rounded-full shadow border text-slate-500 pointer-events-none">
          <Move size={14} />
        </div>
      )}
    </div>
  );
});

// --- Toast Component ---
function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  const isError = toast.type === 'error';
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-5 py-3 rounded-xl shadow-2xl border text-sm font-medium animate-in slide-in-from-bottom-4 fade-in ${isError ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
      {isError ? <AlertTriangle size={16} /> : <Check size={16} />}
      {toast.message}
      <button onClick={onDismiss} className="ml-2 opacity-60 hover:opacity-100">&times;</button>
    </div>
  );
}

export default function App() {
  const [textCode, setTextCode] = useState(defaultCode);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [subgraphs, setSubgraphs] = useState({});
  const [graphDirection, setGraphDirection] = useState('TB');
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  const hasAutoLayedOut = useRef(false);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const dragInfo = useRef({ id: null, offsetX: 0, offsetY: 0 });
  const boardRef = useRef(null);
  const exportAreaRef = useRef(null);
  const [drawingEdge, setDrawingEdge] = useState(null);

  // Toast state
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  useEffect(() => {
    const { newNodes, newEdges, subgraphs: parsedSgs, graphDirection: dir } = parseMermaid(textCode, []);
    setNodes(newNodes);
    setEdges(newEdges);
    setSubgraphs(parsedSgs);
    setGraphDirection(dir);
  }, []);

  useEffect(() => {
    if (nodes.length > 0 && !hasAutoLayedOut.current) {
      applyAutoLayout();
      hasAutoLayedOut.current = true;
    }
  }, [nodes.length]);

  // Wheel event with passive: false
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const handler = (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const scaleBy = 1.1;
        const newScale = e.deltaY > 0 ? transform.scale / scaleBy : transform.scale * scaleBy;
        if (newScale < 0.1 || newScale > 5) return;

        const rect = board.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
        const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

        setTransform({ x: newX, y: newY, scale: newScale });
      } else {
        setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
    };
    board.addEventListener('wheel', handler, { passive: false });
    return () => board.removeEventListener('wheel', handler);
  }, [transform]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setTextCode(val);
    const { newNodes, newEdges, subgraphs: parsedSgs, graphDirection: dir } = parseMermaid(val, nodes);
    setNodes(newNodes);
    setEdges(newEdges);
    setSubgraphs(parsedSgs);
    setGraphDirection(dir);
  };

  // --- DAGRE AUTO LAYOUT ENGINE ---
  const applyAutoLayout = useCallback(() => {
    const currentNodes = [...nodes];
    const currentEdges = [...edges];

    const g = new dagre.graphlib.Graph({ compound: true });
    const rankdir = graphDirection === 'TD' ? 'TB' : graphDirection;
    // Larger spacing for complex diagrams
    const nodeCount = currentNodes.length;
    const ranksep = nodeCount > 30 ? 150 : 100;
    const nodesep = nodeCount > 30 ? 60 : 80;
    g.setGraph({ rankdir, ranksep, nodesep, edgesep: 40, marginx: 80, marginy: 80 });
    g.setDefaultEdgeLabel(() => ({}));

    // Register subgraphs
    Object.keys(subgraphs).forEach(sgId => {
      g.setNode(sgId, { label: subgraphs[sgId].label, clusterLabelPos: 'top' });
    });
    // Link nested subgraphs
    Object.keys(subgraphs).forEach(sgId => {
      if (subgraphs[sgId].parent && g.hasNode(subgraphs[sgId].parent)) {
        g.setParent(sgId, subgraphs[sgId].parent);
      }
    });

    // Register nodes and their parents
    currentNodes.forEach(n => {
      const { width, height } = getNodeDimensions(n.label);
      g.setNode(n.id, { width, height });
      if (n.subgraph && g.hasNode(n.subgraph)) g.setParent(n.id, n.subgraph);
    });

    // Proxy-leaf fix for Dagre rank error
    const getFirstLeafNode = (sgId) => {
      const directNode = currentNodes.find(n => n.subgraph === sgId);
      if (directNode) return directNode.id;
      const childSgs = Object.keys(subgraphs).filter(k => subgraphs[k].parent === sgId);
      for (let c of childSgs) {
        const leaf = getFirstLeafNode(c);
        if (leaf) return leaf;
      }
      return sgId;
    };

    currentEdges.forEach(e => {
      let src = e.source;
      let tgt = e.target;

      if (subgraphs[src]) src = getFirstLeafNode(src);
      if (subgraphs[tgt]) tgt = getFirstLeafNode(tgt);

      if (g.hasNode(src) && g.hasNode(tgt)) {
        g.setEdge(src, tgt);
      }
    });

    try {
      dagre.layout(g);
      const layedOutNodes = currentNodes.map(n => {
        const dNode = g.node(n.id);
        if (dNode) return { ...n, x: dNode.x, y: dNode.y };
        return n;
      });
      setNodes(layedOutNodes);
      // Auto-fit zoom based on content bounds
      let cMinX = Infinity, cMinY = Infinity, cMaxX = -Infinity, cMaxY = -Infinity;
      layedOutNodes.forEach(n => {
        if (n.x < cMinX) cMinX = n.x;
        if (n.y < cMinY) cMinY = n.y;
        if (n.x > cMaxX) cMaxX = n.x;
        if (n.y > cMaxY) cMaxY = n.y;
      });
      const contentW = (cMaxX - cMinX) + 400;
      const contentH = (cMaxY - cMinY) + 400;
      const availW = window.innerWidth * 0.72;
      const availH = window.innerHeight - 100;
      const fitScale = Math.min(availW / contentW, availH / contentH, 0.8);
      const offsetX = (availW - contentW * fitScale) / 2 - cMinX * fitScale + 200;
      const offsetY = (availH - contentH * fitScale) / 2 - cMinY * fitScale + 100;
      setTransform({ x: offsetX, y: offsetY, scale: Math.max(0.15, fitScale) });
    } catch (err) {
      console.error("Layout engine error:", err);
      showToast("Layout başarısız oldu. Diyagramda bağlantı sorunları olabilir.", "error");
    }
  }, [nodes, edges, subgraphs, graphDirection, showToast]);

  const getMouseCoords = (e) => {
    const rect = boardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;
    return { x, y };
  };

  const onMouseDown = (e) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      setIsPanning(true);
      panStart.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    } else if (e.target === boardRef.current || e.target.tagName === 'svg') {
      setSelectedNodeId(null);
    }
  };

  const onMouseMove = (e) => {
    if (isPanning) {
      setTransform(prev => ({ ...prev, x: e.clientX - panStart.current.x, y: e.clientY - panStart.current.y }));
      return;
    }

    const { x, y } = getMouseCoords(e);
    if (drawingEdge) {
      setDrawingEdge(prev => ({ ...prev, endX: x, endY: y }));
    } else if (isDraggingNode && dragInfo.current.id) {
      const newX = x - dragInfo.current.offsetX;
      const newY = y - dragInfo.current.offsetY;
      setNodes(prev => prev.map(n => n.id === dragInfo.current.id ? { ...n, x: newX, y: newY } : n));
    }
  };

  const onMouseUp = (e) => {
    setIsPanning(false);
    if (isDraggingNode) {
      setIsDraggingNode(false);
      dragInfo.current = { id: null, offsetX: 0, offsetY: 0 };
    }

    if (drawingEdge) {
      const { x, y } = getMouseCoords(e);
      const targetNode = nodes.find(n => Math.abs(n.x - x) < 80 && Math.abs(n.y - y) < 60);

      if (targetNode && targetNode.id !== drawingEdge.sourceId) {
        addEdge(drawingEdge.sourceId, targetNode.id);
      }
      setDrawingEdge(null);
    }
  };

  const startDragNode = useCallback((e, id) => {
    if (e.button !== 0 || drawingEdge) return;
    e.stopPropagation();
    setSelectedNodeId(id);
    const { x, y } = getMouseCoords(e);
    const node = nodes.find(n => n.id === id);
    if (node) {
      dragInfo.current = { id, offsetX: x - node.x, offsetY: y - node.y };
      setIsDraggingNode(true);
    }
  }, [nodes, drawingEdge, transform]);

  const startDrawEdge = useCallback((e, sourceId) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === sourceId);
    if (node) setDrawingEdge({ sourceId, startX: node.x, startY: node.y, endX: node.x, endY: node.y });
  }, [nodes]);

  const updateNodeStyle = (id, changes) => {
    const updatedNodes = nodes.map(n => n.id === id ? { ...n, ...changes } : n);
    setNodes(updatedNodes);
    setTextCode(generateMermaid(updatedNodes, edges, subgraphs, graphDirection));
  };

  const addNode = () => {
    const id = `Node${Date.now().toString().slice(-4)}`;
    const { x: centerX, y: centerY } = getMouseCoords({ clientX: window.innerWidth / 2, clientY: window.innerHeight / 2 });
    const newNode = {
      id, label: 'New Node', shape: 'default',
      x: centerX, y: centerY, fill: '#ffffff', color: '#1e293b', stroke: '#cbd5e1', strokeWidth: '2px'
    };
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
    setTextCode(generateMermaid(updatedNodes, edges, subgraphs, graphDirection));
    setSelectedNodeId(id);
  };

  const deleteNode = (id) => {
    const updatedNodes = nodes.filter(n => n.id !== id);
    const updatedEdges = edges.filter(e => e.source !== id && e.target !== id);
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    setTextCode(generateMermaid(updatedNodes, updatedEdges, subgraphs, graphDirection));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const addEdge = (sourceId, targetId) => {
    if (!targetId || sourceId === targetId) return;
    // Duplicate edge check
    const exists = edges.some(e => e.source === sourceId && e.target === targetId);
    if (exists) return;
    const newEdges = [...edges, { id: `e${Date.now()}`, source: sourceId, target: targetId, label: '' }];
    setEdges(newEdges);
    setTextCode(generateMermaid(nodes, newEdges, subgraphs, graphDirection));
  };

  const deleteEdge = (edgeId) => {
    const updatedEdges = edges.filter(e => e.id !== edgeId);
    setEdges(updatedEdges);
    setTextCode(generateMermaid(nodes, updatedEdges, subgraphs, graphDirection));
  };

  // --- RECURSIVE BOUNDS CALCULATOR ---
  const getSubgraphBounds = useCallback((sgId) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasContent = false;

    nodes.forEach(n => {
      if (n.subgraph === sgId && typeof n.x === 'number' && !isNaN(n.x)) {
        hasContent = true;
        const { width: nw, height: nh } = getNodeDimensions(n.label);

        if (n.x - nw/2 < minX) minX = n.x - nw/2;
        if (n.x + nw/2 > maxX) maxX = n.x + nw/2;
        if (n.y - nh/2 < minY) minY = n.y - nh/2;
        if (n.y + nh/2 > maxY) maxY = n.y + nh/2;
      }
    });

    Object.keys(subgraphs).forEach(childId => {
      if (subgraphs[childId].parent === sgId) {
        const cBounds = getSubgraphBounds(childId);
        if (cBounds) {
          hasContent = true;
          if (cBounds.minX < minX) minX = cBounds.minX;
          if (cBounds.maxX > maxX) maxX = cBounds.maxX;
          if (cBounds.minY < minY) minY = cBounds.minY;
          if (cBounds.maxY > maxY) maxY = cBounds.maxY;
        }
      }
    });

    if (!hasContent) return null;
    return { minX: minX - 40, maxX: maxX + 40, minY: minY - 60, maxY: maxY + 40 };
  }, [nodes, subgraphs]);

  const renderSubgraphs = () => {
    return Object.keys(subgraphs).map(sgId => {
      const bounds = getSubgraphBounds(sgId);
      if (!bounds) return null;

      return (
        <div key={`sg_${sgId}`} className="absolute border-[2px] pointer-events-none transition-all duration-300"
             style={{
               left: bounds.minX, top: bounds.minY,
               width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY,
               backgroundColor: 'rgba(230, 240, 255, 0.4)',
               borderColor: '#93c5fd',
               borderRadius: '16px'
             }}>
          <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 font-bold text-slate-700 text-sm bg-white border border-blue-200 px-4 py-1 rounded-full shadow-sm whitespace-nowrap">
            {String(subgraphs[sgId].label || '')}
          </div>
        </div>
      );
    });
  };

  const getShapeBounds = useCallback((id) => {
    const n = nodes.find(x => x.id === id);
    if (n && typeof n.x === 'number' && !isNaN(n.x)) {
       const { width: nw } = getNodeDimensions(n.label);
       return { x: n.x, y: n.y, isNode: true, R: nw/2 + 10 };
    }

    const sgBounds = getSubgraphBounds(id);
    if (sgBounds) {
      return {
        x: (sgBounds.minX + sgBounds.maxX) / 2,
        y: (sgBounds.minY + sgBounds.maxY) / 2,
        isNode: false,
        R: Math.min(sgBounds.maxX - sgBounds.minX, sgBounds.maxY - sgBounds.minY) / 2
      };
    }
    return null;
  }, [nodes, getSubgraphBounds]);

  // --- Figma-optimized SVG generation ---
  const generateFigmaSVG = useCallback(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    // Include subgraph bounds
    Object.keys(subgraphs).forEach(sgId => {
      const bounds = getSubgraphBounds(sgId);
      if (bounds) {
        if (bounds.minX < minX) minX = bounds.minX;
        if (bounds.minY < minY) minY = bounds.minY;
        if (bounds.maxX > maxX) maxX = bounds.maxX;
        if (bounds.maxY > maxY) maxY = bounds.maxY;
      }
    });

    nodes.forEach(n => {
      const { width: nw, height: nh } = getNodeDimensions(n.label);
      const left = n.x - nw/2 - 20;
      const right = n.x + nw/2 + 20;
      const top = n.y - nh/2 - 20;
      const bottom = n.y + nh/2 + 20;
      if (left < minX) minX = left;
      if (top < minY) minY = top;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    });

    const pad = 80;
    const w = (maxX - minX) + pad * 2 || 1000;
    const h = (maxY - minY) + pad * 2 || 1000;
    const startX = (minX - pad) || 0;
    const startY = (minY - pad) || 0;

    // Use simple font names without quotes to avoid XML attribute breakage
    const fontFamily = 'Inter, Helvetica, Arial, sans-serif';

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w)}" height="${Math.round(h)}" viewBox="${Math.round(startX)} ${Math.round(startY)} ${Math.round(w)} ${Math.round(h)}">`;

    svg += `\n  <defs>`;
    svg += `\n    <style>text { font-family: ${fontFamily}; }</style>`;
    svg += `\n    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">`;
    svg += `\n      <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />`;
    svg += `\n    </marker>`;
    svg += `\n  </defs>`;

    // Subgraphs layer
    const sgKeys = Object.keys(subgraphs);
    if (sgKeys.length > 0) {
      svg += `\n\n  <!-- Subgraphs -->`;
      svg += `\n  <g id="Subgraphs">`;
      sgKeys.forEach(sgId => {
        const bounds = getSubgraphBounds(sgId);
        if (!bounds) return;
        const bw = bounds.maxX - bounds.minX;
        const bh = bounds.maxY - bounds.minY;
        const cx = (bounds.minX + bounds.maxX) / 2;
        const labelText = escapeHtml(subgraphs[sgId].label || sgId);
        const labelWidth = Math.max(80, labelText.length * 9 + 32);

        svg += `\n    <g id="group-${escapeHtml(sgId)}">`;
        svg += `\n      <rect x="${bounds.minX}" y="${bounds.minY}" width="${bw}" height="${bh}" fill="#e0ecff" fill-opacity="0.4" stroke="#93c5fd" stroke-width="2" rx="16" ry="16" />`;
        svg += `\n      <rect x="${cx - labelWidth/2}" y="${bounds.minY - 15}" width="${labelWidth}" height="30" fill="#ffffff" stroke="#bfdbfe" stroke-width="1" rx="15" ry="15" />`;
        svg += `\n      <text x="${cx}" y="${bounds.minY + 4}" font-size="13" font-weight="700" fill="#334155" text-anchor="middle" dy="0.35em">${labelText}</text>`;
        svg += `\n    </g>`;
      });
      svg += `\n  </g>`;
    }

    // Edges layer
    if (edges.length > 0) {
      svg += `\n\n  <!-- Edges -->`;
      svg += `\n  <g id="Edges">`;
      edges.forEach(e => {
        const src = getShapeBounds(e.source);
        const tgt = getShapeBounds(e.target);
        if (!src || !tgt) return;

        const dx = tgt.x - src.x;
        const dy = tgt.y - src.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const srcR = src.R || 75;
        const tgtR = tgt.R || 75;
        const sX = dist > srcR ? src.x + dx * (srcR / dist) : src.x;
        const sY = dist > srcR ? src.y + dy * (srcR / dist) : src.y;
        const tX = dist > tgtR ? tgt.x - dx * (tgtR / dist) : tgt.x;
        const tY = dist > tgtR ? tgt.y - dy * (tgtR / dist) : tgt.y;

        svg += `\n    <g id="edge-${escapeHtml(e.source)}-to-${escapeHtml(e.target)}">`;
        svg += `\n      <line x1="${Math.round(sX)}" y1="${Math.round(sY)}" x2="${Math.round(tX)}" y2="${Math.round(tY)}" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrow)" />`;

        if (e.label) {
          const midX = (src.x + tgt.x) / 2;
          const midY = (src.y + tgt.y) / 2;
          const labelText = escapeHtml(e.label);
          const labelWidth = Math.max(40, labelText.length * 7 + 20);
          svg += `\n      <rect x="${midX - labelWidth/2}" y="${midY - 12}" width="${labelWidth}" height="24" fill="#ffffff" rx="4" ry="4" stroke="#e2e8f0" stroke-width="1" />`;
          svg += `\n      <text x="${midX}" y="${midY + 4}" font-size="11" fill="#334155" text-anchor="middle" dy="0.35em">${labelText}</text>`;
        }
        svg += `\n    </g>`;
      });
      svg += `\n  </g>`;
    }

    // Nodes layer
    if (nodes.length > 0) {
      svg += `\n\n  <!-- Nodes -->`;
      svg += `\n  <g id="Nodes">`;
      nodes.forEach(n => {
        const { width: nw, height: nh, lines } = getNodeDimensions(n.label);
        const strokeW = parseInt(String(n.strokeWidth).replace('px', ''), 10) || 0;
        const isDiamond = n.shape === 'diamond';
        const rx = n.shape === 'round' ? Math.min(nw/2, nh/2) : 8;

        svg += `\n    <g id="node-${escapeHtml(n.id)}">`;

        if (isDiamond) {
          const dw = nw / 2 + 25;
          const dh = nh / 2 + 25;
          svg += `\n      <polygon points="${n.x},${n.y - dh} ${n.x + dw},${n.y} ${n.x},${n.y + dh} ${n.x - dw},${n.y}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeW}" />`;
        } else if (n.shape === 'cylinder') {
          // Cylinder: rect with ellipse top/bottom
          const ry = 12;
          svg += `\n      <rect x="${n.x - nw/2}" y="${n.y - nh/2 + ry}" width="${nw}" height="${nh - ry}" rx="0" ry="0" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeW}" />`;
          svg += `\n      <ellipse cx="${n.x}" cy="${n.y - nh/2 + ry}" rx="${nw/2}" ry="${ry}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeW}" />`;
          svg += `\n      <ellipse cx="${n.x}" cy="${n.y + nh/2}" rx="${nw/2}" ry="${ry}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeW}" />`;
        } else {
          svg += `\n      <rect x="${n.x - nw/2}" y="${n.y - nh/2}" width="${nw}" height="${nh}" rx="${rx}" ry="${rx}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeW}" />`;
        }

        lines.forEach((line, i) => {
          const yOff = n.y - ((lines.length - 1) * 10) + (i * 20);
          svg += `\n      <text x="${n.x}" y="${yOff}" font-size="14" font-weight="600" fill="${n.color}" text-anchor="middle" dy="0.35em">${escapeHtml(line)}</text>`;
        });

        svg += `\n    </g>`;
      });
      svg += `\n  </g>`;
    }

    svg += `\n</svg>`;
    return svg;
  }, [nodes, edges, subgraphs, getSubgraphBounds, getShapeBounds]);

  const exportFigmaSVG = useCallback((toClipboard = false) => {
    const svg = generateFigmaSVG();

    if (toClipboard) {
      navigator.clipboard.writeText(svg).then(() => {
        showToast("SVG panoya kopyalandı! Figma'da Ctrl+V ile yapıştırabilirsiniz.");
      }).catch(() => {
        showToast("Panoya kopyalama başarısız oldu.", "error");
      });
    } else {
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `figma_export_${Date.now()}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("SVG dosyası indirildi.");
    }
  }, [generateFigmaSVG, showToast]);

  const handleExport = async (format, includeBackground) => {
    if (format === 'figma') { exportFigmaSVG(false); return; }
    if (format === 'figma-clipboard') { exportFigmaSVG(true); return; }
    if (!exportAreaRef.current) return;

    const oldTransform = { ...transform };
    setTransform({ x: 0, y: 0, scale: 1 });
    setSelectedNodeId(null);
    await new Promise(r => setTimeout(r, 100));

    const element = exportAreaRef.current;
    const bgOriginal = element.style.background;
    if (!includeBackground) {
      element.style.background = 'transparent';
      element.style.backgroundImage = 'none';
    }

    try {
      const canvas = await html2canvas(element, { backgroundColor: includeBackground ? '#f1f5f9' : null, scale: 2 });
      if (format === 'png') {
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `diagram_${Date.now()}.png`;
        a.click();
        showToast("PNG dosyası indirildi.");
      } else if (format === 'pdf') {
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
        pdf.save(`diagram_${Date.now()}.pdf`);
        showToast("PDF dosyası indirildi.");
      }
    } catch (e) {
      console.error("Export error:", e);
      showToast("Export sırasında bir hata oluştu.", "error");
    } finally {
      if (!includeBackground) element.style.background = bgOriginal;
      setTransform(oldTransform);
    }
  };

  const formatLabel = useCallback((htmlString) => {
    const safeStr = typeof htmlString === 'string' ? htmlString : String(htmlString || '');
    return safeStr.split(/<br\s*\/?>/i).map((line, i, arr) => (
      <React.Fragment key={i}>
        {line}
        {i !== arr.length - 1 && <br/>}
      </React.Fragment>
    ));
  }, []);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="flex h-screen w-full bg-slate-100 text-slate-800 font-sans overflow-hidden">

      {/* Sidebar: Mermaid Editor */}
      <div className="w-1/4 min-w-[350px] border-r border-slate-300 bg-white flex flex-col z-40 shadow-xl">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 flex items-center gap-2">
            <span className="bg-blue-600 text-white p-1.5 rounded"><MousePointer2 size={16}/></span>
            Mermaid Code
          </h2>
        </div>
        <textarea
          value={textCode}
          onChange={handleTextChange}
          placeholder="Paste your Mermaid code here..."
          className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none bg-slate-50 text-slate-700 whitespace-pre leading-relaxed"
          spellCheck="false"
        />
      </div>

      {/* Main Board */}
      <div className="flex-1 relative overflow-hidden flex flex-col bg-slate-200">

        {/* Toolbar */}
        <div className="absolute top-4 left-4 z-40 flex gap-3">
          <button onClick={applyAutoLayout} className="bg-white border-2 border-indigo-200 shadow-md px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-50 font-bold transition-colors text-indigo-700">
            <LayoutTemplate size={18} /> Auto Layout
          </button>
          <button onClick={addNode} className="bg-white border border-slate-300 shadow-sm px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 font-medium transition-colors">
            <Plus size={18} className="text-blue-600"/> Add Node
          </button>
          <div className="bg-white border border-slate-300 shadow-sm rounded-lg flex items-center overflow-hidden">
            <button onClick={() => setTransform(p => ({...p, scale: p.scale * 1.2}))} className="p-2 hover:bg-slate-100 border-r border-slate-200" title="Zoom In"><ZoomIn size={18} className="text-slate-600"/></button>
            <button onClick={() => setTransform(p => ({...p, scale: p.scale / 1.2}))} className="p-2 hover:bg-slate-100 border-r border-slate-200" title="Zoom Out"><ZoomOut size={18} className="text-slate-600"/></button>
            <button onClick={() => setTransform({x: window.innerWidth*0.1, y: 50, scale:0.7})} className="p-2 hover:bg-slate-100" title="Reset View"><Maximize size={18} className="text-slate-600"/></button>
            <span className="px-3 text-xs font-mono text-slate-500 bg-slate-50 border-l border-slate-200 h-full flex items-center">
              {Math.round(transform.scale * 100)}%
            </span>
          </div>

          <div className="group relative">
            <button className="bg-white border border-slate-300 shadow-sm px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 font-medium transition-colors">
              <Download size={18} className="text-green-600"/> Export
            </button>
            <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden hidden group-hover:block transition-all">
              <div className="px-4 py-2 text-xs font-bold text-slate-400 bg-slate-50 uppercase tracking-wider border-b border-slate-100">Standard Export</div>
              <button onClick={() => handleExport('png', true)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm">Download as Image (PNG)</button>
              <button onClick={() => handleExport('pdf', true)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b border-slate-100">Download as PDF</button>
              <div className="px-4 py-2 text-xs font-bold text-indigo-400 bg-indigo-50 uppercase tracking-wider border-b border-indigo-100">Figma / Vector</div>
              <button onClick={() => handleExport('figma', false)} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-semibold text-indigo-700 flex items-center gap-2">
                <Download size={14} /> Download SVG
              </button>
              <button onClick={() => handleExport('figma-clipboard', false)} className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-semibold text-indigo-700 flex items-center gap-2 border-t border-indigo-100">
                <Copy size={14} /> Copy SVG to Clipboard
              </button>
            </div>
          </div>
        </div>

        {/* Node Properties Panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-white p-5 rounded-xl shadow-2xl border border-slate-200 w-80 z-40 animate-in slide-in-from-right-4 fade-in max-h-[90vh] overflow-y-auto">
            <h3 className="font-bold mb-4 text-slate-800 border-b pb-2 flex justify-between items-center">
              Edit Node
              <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500 break-all w-32 truncate text-right">{selectedNode.id}</span>
            </h3>
            <label className="block text-sm font-medium mb-1 text-slate-600">Text <span className="text-xs text-slate-400 font-normal">(use &lt;br/&gt;)</span></label>
            <textarea
              value={selectedNode.label}
              onChange={(e) => updateNodeStyle(selectedNode.id, { label: e.target.value })}
              className="w-full border border-slate-300 p-2 rounded-md mb-4 focus:ring-2 focus:ring-blue-500 outline-none text-sm min-h-[80px]"
            />
            <label className="block text-sm font-medium mb-1 text-slate-600">Shape</label>
            <select
              value={selectedNode.shape}
              onChange={(e) => updateNodeStyle(selectedNode.id, { shape: e.target.value })}
              className="w-full border border-slate-300 p-2 rounded-md mb-4 outline-none text-sm"
            >
              <option value="default">Rectangle</option>
              <option value="round">Rounded Rectangle</option>
              <option value="diamond">Diamond (Decision)</option>
              <option value="cylinder">Cylinder (Database)</option>
            </select>

            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600">Background</label>
                <input type="color" value={selectedNode.fill} onChange={(e) => updateNodeStyle(selectedNode.id, { fill: e.target.value })} className="w-full h-8 rounded cursor-pointer border border-slate-300 p-0.5" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600">Text Color</label>
                <input type="color" value={selectedNode.color} onChange={(e) => updateNodeStyle(selectedNode.id, { color: e.target.value })} className="w-full h-8 rounded cursor-pointer border border-slate-300 p-0.5" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600">Border</label>
                <input type="color" value={selectedNode.stroke} onChange={(e) => updateNodeStyle(selectedNode.id, { stroke: e.target.value })} className="w-full h-8 rounded cursor-pointer border border-slate-300 p-0.5" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600">Border Width</label>
                <select value={selectedNode.strokeWidth} onChange={(e) => updateNodeStyle(selectedNode.id, { strokeWidth: e.target.value })} className="w-full border border-slate-300 p-1.5 rounded-md outline-none text-xs">
                  <option value="0px">None</option>
                  <option value="1px">Thin</option>
                  <option value="2px">Normal</option>
                  <option value="4px">Thick</option>
                </select>
              </div>
            </div>
            <button onClick={() => deleteNode(selectedNode.id)} className="w-full bg-red-50 text-red-600 p-2 rounded-md flex items-center justify-center gap-2 hover:bg-red-100 transition-colors border border-red-200 font-medium text-sm">
              <Trash2 size={16} /> Delete Node
            </button>
          </div>
        )}

        {/* Canvas */}
        <div
          ref={boardRef}
          className="flex-1 w-full h-full cursor-grab active:cursor-grabbing outline-none"
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          tabIndex={0}
        >
          <div
            ref={exportAreaRef}
            className="absolute top-0 left-0 w-[8000px] h-[8000px] origin-top-left transition-transform duration-75"
            style={{
              transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
              backgroundImage: 'radial-gradient(#94a3b8 1px, transparent 1px)',
              backgroundSize: '40px 40px',
              backgroundColor: '#f8fafc'
            }}
          >
            {renderSubgraphs()}

            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 overflow-visible">
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#475569" />
                </marker>
                <marker id="arrowhead-drawing" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#3b82f6" />
                </marker>
              </defs>

              {drawingEdge && (
                <line
                  x1={drawingEdge.startX} y1={drawingEdge.startY}
                  x2={drawingEdge.endX} y2={drawingEdge.endY}
                  stroke="#3b82f6" strokeWidth="3" strokeDasharray="5,5"
                  markerEnd="url(#arrowhead-drawing)"
                />
              )}

              {edges.map(e => {
                const src = getShapeBounds(e.source);
                const tgt = getShapeBounds(e.target);
                if (!src || !tgt) return null;

                const dx = tgt.x - src.x;
                const dy = tgt.y - src.y;
                const dist = Math.sqrt(dx*dx + dy*dy) || 1;

                const R = tgt.R || 75;
                const targetX = dist > R ? tgt.x - dx * (R/dist) : tgt.x;
                const targetY = dist > R ? tgt.y - dy * (R/dist) : tgt.y;
                const sourceX = dist > R ? src.x + dx * (R/dist) : src.x;
                const sourceY = dist > R ? src.y + dy * (R/dist) : src.y;

                const midX = (src.x + tgt.x) / 2;
                const midY = (src.y + tgt.y) / 2;

                return (
                  <g key={e.id} className="pointer-events-auto">
                    <line
                      x1={sourceX} y1={sourceY}
                      x2={targetX} y2={targetY}
                      stroke="#64748b" strokeWidth="2.5"
                      markerEnd="url(#arrowhead)"
                    />

                    {e.label && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect x="-50" y="-12" width="100" height="24" fill="#ffffff" rx="4" stroke="#e2e8f0" />
                        <text x="0" y="4" textAnchor="middle" fill="#334155" fontSize="11" className="pointer-events-none font-medium truncate">{String(e.label)}</text>
                      </g>
                    )}

                    <g
                      transform={`translate(${midX}, ${midY - (e.label ? 22 : 0)})`}
                      className="cursor-pointer group"
                      onClick={(ev) => { ev.stopPropagation(); deleteEdge(e.id); }}
                    >
                      <circle cx="0" cy="0" r="14" fill="transparent" />
                      <circle cx="0" cy="0" r="10" fill="#cbd5e1" className="group-hover:fill-red-500 transition-colors" />
                      <text x="0" y="3" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">&times;</text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {nodes.map(n => (
              <NodeComponent
                key={n.id}
                node={n}
                isSelected={selectedNodeId === n.id}
                onMouseDown={startDragNode}
                onStartDrawEdge={startDrawEdge}
                formatLabel={formatLabel}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Toast */}
      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
