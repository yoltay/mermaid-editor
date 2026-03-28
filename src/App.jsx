import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, GripHorizontal, MousePointer2, ZoomIn, ZoomOut, Maximize, Download, Move, LayoutTemplate } from 'lucide-react';

// --- External Script Loaders ---
const loadExternalScripts = (onDagreLoaded) => {
  if (!document.getElementById('dagre-script')) {
    const script = document.createElement('script');
    script.id = 'dagre-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js';
    script.onload = () => { if(onDagreLoaded) onDagreLoaded(true); };
    document.body.appendChild(script);
  } else if (window.dagre && onDagreLoaded) {
    onDagreLoaded(true);
  }

  if (!document.getElementById('html2canvas-script')) {
    const script = document.createElement('script');
    script.id = 'html2canvas-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.body.appendChild(script);
  }
  if (!document.getElementById('jspdf-script')) {
    const script = document.createElement('script');
    script.id = 'jspdf-script';
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    document.body.appendChild(script);
  }
};

// --- Advanced Parser & Generator ---
const parseMermaid = (code, existingNodes) => {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%'));
  const nodesMap = {};
  const edges = [];
  const subgraphs = {};
  const classDefs = {};
  
  const subgraphStack = [];
  let currentSubgraph = null;
  let edgeCounter = 0;

  const getOrCreateNode = (id, label = null, shape = null) => {
    if (!nodesMap[id]) {
      const ex = existingNodes.find(n => n.id === id);
      nodesMap[id] = {
        id,
        label: label || id,
        shape: shape || 'default',
        x: ex?.x || 0,
        y: ex?.y || 0,
        fill: ex?.fill || '#ffffff',
        color: ex?.color || '#1e293b',
        stroke: ex?.stroke || '#cbd5e1',
        strokeWidth: ex?.strokeWidth || '2px',
        subgraph: currentSubgraph
      };
    } else {
      if (label && label !== id) nodesMap[id].label = label;
      if (shape) nodesMap[id].shape = shape;
      if (currentSubgraph && !nodesMap[id].subgraph) nodesMap[id].subgraph = currentSubgraph;
    }
    return nodesMap[id];
  };

  const nodeRegex = /^([a-zA-Z0-9_]+)(?:(\[|\(|\{)(?:")?(.*?)(?:")?(\]|\)|\}))?$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('graph') || line.startsWith('flowchart') || line.startsWith('direction')) continue;

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
      const sMatch = srcStr.match(nodeRegex);
      if (sMatch) { srcId = sMatch[1]; getOrCreateNode(srcId, sMatch[3], sMatch[2] === '(' ? 'round' : sMatch[2] === '{' ? 'diamond' : 'default'); }
      else getOrCreateNode(srcId);

      const targets = targetsStr.split('&').map(t => t.trim());
      targets.forEach(tgtStr => {
        let tgtId = tgtStr;
        const tMatch = tgtStr.match(nodeRegex);
        if (tMatch) { tgtId = tMatch[1]; getOrCreateNode(tgtId, tMatch[3], tMatch[2] === '(' ? 'round' : tMatch[2] === '{' ? 'diamond' : 'default'); }
        else getOrCreateNode(tgtId);
        
        edges.push({ id: `e${edgeCounter++}`, source: srcId, target: tgtId, label: edgeLabel });
      });
      continue;
    }

    const match = line.match(nodeRegex);
    if (match) getOrCreateNode(match[1], match[3], match[2] === '(' ? 'round' : match[2] === '{' ? 'diamond' : 'default');
  }

  const newNodes = Object.values(nodesMap).filter(n => !subgraphs[n.id]);
  return { newNodes, newEdges: edges, subgraphs };
};

const generateMermaid = (nodes, edges, subgraphs) => {
  let code = "flowchart TB\n\n";

  const writeNode = (n) => {
    let open = '[', close = ']';
    if (n.shape === 'round') { open = '('; close = ')'; }
    if (n.shape === 'diamond') { open = '{'; close = '}'; }
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

export default function App() {
  const [textCode, setTextCode] = useState(defaultCode);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [subgraphs, setSubgraphs] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  
  const [isDagreLoaded, setIsDagreLoaded] = useState(false);
  const hasAutoLayedOut = useRef(false);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.8 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0 });

  const [isDraggingNode, setIsDraggingNode] = useState(false);
  const dragInfo = useRef({ id: null, offsetX: 0, offsetY: 0 });
  const boardRef = useRef(null);
  const exportAreaRef = useRef(null);
  const [drawingEdge, setDrawingEdge] = useState(null);

  useEffect(() => {
    loadExternalScripts(setIsDagreLoaded);
    const { newNodes, newEdges, subgraphs: parsedSgs } = parseMermaid(textCode, []);
    setNodes(newNodes);
    setEdges(newEdges);
    setSubgraphs(parsedSgs);
  }, []);

  useEffect(() => {
    if (isDagreLoaded && nodes.length > 0 && !hasAutoLayedOut.current) {
      applyAutoLayout();
      hasAutoLayedOut.current = true;
    }
  }, [isDagreLoaded, nodes.length]);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setTextCode(val);
    const { newNodes, newEdges, subgraphs: parsedSgs } = parseMermaid(val, nodes);
    setNodes(newNodes);
    setEdges(newEdges);
    setSubgraphs(parsedSgs);
  };

  // --- DAGRE AUTO LAYOUT ENGINE (Safe Version) ---
  const applyAutoLayout = () => {
    if (!window.dagre) return;
    
    const currentNodes = [...nodes];
    const currentEdges = [...edges];

    const g = new window.dagre.graphlib.Graph({ compound: true });
    g.setGraph({ rankdir: 'TB', ranksep: 100, nodesep: 80, edgesep: 50, marginx: 50, marginy: 50 });
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
      const labelStr = String(n.label || '');
      const lines = labelStr.split(/<br\s*\/?>/i);
      const maxLineLen = Math.max(...lines.map(l => l.length));
      const width = Math.max(160, maxLineLen * 8.5);
      const height = Math.max(60, lines.length * 24 + 20);
      
      g.setNode(n.id, { width, height });
      if (n.subgraph && g.hasNode(n.subgraph)) g.setParent(n.id, n.subgraph);
    });

    // BUG FIX: Dagre "rank" error occurs when edges point to a cluster that has no direct nodes
    // Workaround: Find a descendant leaf node to use as a proxy for the edge during layout calculation
    const getFirstLeafNode = (sgId) => {
      const directNode = currentNodes.find(n => n.subgraph === sgId);
      if (directNode) return directNode.id;
      const childSgs = Object.keys(subgraphs).filter(k => subgraphs[k].parent === sgId);
      for (let c of childSgs) {
        const leaf = getFirstLeafNode(c);
        if (leaf) return leaf;
      }
      return sgId; // fallback
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
      window.dagre.layout(g);
      const layedOutNodes = currentNodes.map(n => {
        const dNode = g.node(n.id);
        if (dNode) return { ...n, x: dNode.x, y: dNode.y };
        return n;
      });
      setNodes(layedOutNodes);
      setTransform({ x: window.innerWidth * 0.15, y: 50, scale: 0.65 });
    } catch (err) {
      console.error("Layout engine error (Usually due to disconnected components):", err);
      alert("Layout failed. The diagram might have complex disconnected cycles.");
    }
  };

  const getMouseCoords = (e) => {
    const rect = boardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - transform.x) / transform.scale;
    const y = (e.clientY - rect.top - transform.y) / transform.scale;
    return { x, y };
  };

  const handleWheel = (e) => {
    e.preventDefault();
    if(e.ctrlKey || e.metaKey) {
      const scaleBy = 1.1;
      const newScale = e.deltaY > 0 ? transform.scale / scaleBy : transform.scale * scaleBy;
      if (newScale < 0.1 || newScale > 5) return;
      
      const rect = boardRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newX = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
      const newY = mouseY - (mouseY - transform.y) * (newScale / transform.scale);

      setTransform({ x: newX, y: newY, scale: newScale });
    } else {
      setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
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

  const startDragNode = (e, id) => {
    if (e.button !== 0 || drawingEdge) return;
    e.stopPropagation();
    setSelectedNodeId(id);
    const { x, y } = getMouseCoords(e);
    const node = nodes.find(n => n.id === id);
    if (node) {
      dragInfo.current = { id, offsetX: x - node.x, offsetY: y - node.y };
      setIsDraggingNode(true);
    }
  };

  const startDrawEdge = (e, sourceId) => {
    e.stopPropagation();
    const node = nodes.find(n => n.id === sourceId);
    if (node) setDrawingEdge({ sourceId, startX: node.x, startY: node.y, endX: node.x, endY: node.y });
  };

  const updateNodeStyle = (id, changes) => {
    const updatedNodes = nodes.map(n => n.id === id ? { ...n, ...changes } : n);
    setNodes(updatedNodes);
    setTextCode(generateMermaid(updatedNodes, edges, subgraphs));
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
    setTextCode(generateMermaid(updatedNodes, edges, subgraphs));
    setSelectedNodeId(id);
  };

  const deleteNode = (id) => {
    const updatedNodes = nodes.filter(n => n.id !== id);
    const updatedEdges = edges.filter(e => e.source !== id && e.target !== id);
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    setTextCode(generateMermaid(updatedNodes, updatedEdges, subgraphs));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const addEdge = (sourceId, targetId) => {
    if(!targetId || sourceId === targetId) return;
    const newEdges = [...edges, { id: `e${Date.now()}`, source: sourceId, target: targetId, label: '' }];
    setEdges(newEdges);
    setTextCode(generateMermaid(nodes, newEdges, subgraphs));
  };

  const deleteEdge = (edgeId) => {
    const updatedEdges = edges.filter(e => e.id !== edgeId);
    setEdges(updatedEdges);
    setTextCode(generateMermaid(nodes, updatedEdges, subgraphs));
  };

  // --- RECURSIVE BOUNDS CALCULATOR ---
  const getSubgraphBounds = (sgId) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let hasContent = false;

    nodes.forEach(n => {
      if (n.subgraph === sgId && typeof n.x === 'number' && !isNaN(n.x)) {
        hasContent = true;
        const lines = String(n.label || '').split(/<br\s*\/?>/i);
        const nw = Math.max(160, Math.max(...lines.map(l => l.length)) * 8);
        const nh = Math.max(60, lines.length * 20 + 20);
        
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
  };

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

  const getShapeBounds = (id) => {
    const n = nodes.find(x => x.id === id);
    if (n && typeof n.x === 'number' && !isNaN(n.x)) {
       const lines = String(n.label || '').split(/<br\s*\/?>/i);
       const nw = Math.max(160, Math.max(...lines.map(l => l.length)) * 8);
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
  };

  const exportFigmaSVG = () => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      if(n.x < minX) minX = n.x; if(n.y < minY) minY = n.y;
      if(n.x > maxX) maxX = n.x; if(n.y > maxY) maxY = n.y;
    });
    const pad = 150;
    const w = (maxX - minX) + pad*2 || 1000;
    const h = (maxY - minY) + pad*2 || 1000;
    const startX = minX - pad || 0;
    const startY = minY - pad || 0;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${startX} ${startY} ${w} ${h}" style="background-color: transparent; font-family: sans-serif;">`;
    svg += `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" /></marker></defs>`;
    
    Object.keys(subgraphs).forEach(sgId => {
      const bounds = getSubgraphBounds(sgId);
      if (!bounds) return;
      svg += `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.maxX - bounds.minX}" height="${bounds.maxY - bounds.minY}" fill="#e6f0ff" fill-opacity="0.4" stroke="#93c5fd" stroke-width="2" rx="16" />`;
      svg += `<rect x="${(bounds.minX+bounds.maxX)/2 - 80}" y="${bounds.minY - 15}" width="160" height="30" fill="#ffffff" stroke="#93c5fd" stroke-width="1" rx="15" />`;
      svg += `<text x="${(bounds.minX+bounds.maxX)/2}" y="${bounds.minY + 4}" font-size="14" font-weight="bold" fill="#334155" text-anchor="middle" dominant-baseline="middle">${subgraphs[sgId].label}</text>`;
    });

    edges.forEach(e => {
      const src = getShapeBounds(e.source);
      const tgt = getShapeBounds(e.target);
      if (!src || !tgt) return;
      const dx = tgt.x - src.x; const dy = tgt.y - src.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1; 
      const R = tgt.R || 75; 
      const tX = dist > R ? tgt.x - dx * (R/dist) : tgt.x; const tY = dist > R ? tgt.y - dy * (R/dist) : tgt.y;
      const sX = dist > R ? src.x + dx * (R/dist) : src.x; const sY = dist > R ? src.y + dy * (R/dist) : src.y;
      
      svg += `<line x1="${sX}" y1="${sY}" x2="${tX}" y2="${tY}" stroke="#64748b" stroke-width="2.5" marker-end="url(#arrow)" />`;
      
      if (e.label) {
        const midX = (src.x + tgt.x) / 2; const midY = (src.y + tgt.y) / 2;
        svg += `<rect x="${midX - 50}" y="${midY - 12}" width="100" height="24" fill="#ffffff" rx="4" stroke="#e2e8f0" />`;
        svg += `<text x="${midX}" y="${midY + 4}" font-size="11" fill="#334155" text-anchor="middle" dominant-baseline="middle">${e.label}</text>`;
      }
    });

    nodes.forEach(n => {
      let rx = n.shape === 'round' ? 30 : 8;
      let isDiamond = n.shape === 'diamond';
      const lines = String(n.label || '').split(/<br\s*\/?>/i);
      const nw = Math.max(160, Math.max(...lines.map(l => l.length)) * 8.5);
      const nh = Math.max(60, lines.length * 20 + 20);
      const strokeW = n.strokeWidth.replace('px','') || 0;
      
      if (isDiamond) {
        svg += `<polygon points="${n.x},${n.y - nh/2 - 20} ${n.x + nw/2 + 20},${n.y} ${n.x},${n.y + nh/2 + 20} ${n.x - nw/2 - 20},${n.y}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeW}" />`;
      } else {
        svg += `<rect x="${n.x - nw/2}" y="${n.y - nh/2}" width="${nw}" height="${nh}" rx="${rx}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${strokeW}" />`;
      }

      lines.forEach((line, i) => {
        let yOff = n.y - (lines.length * 10) + (i * 20) + 15;
        svg += `<text x="${n.x}" y="${yOff}" font-size="14" font-weight="bold" fill="${n.color}" text-anchor="middle">${line}</text>`;
      });
    });

    svg += `</svg>`;
    const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `figma_export_${Date.now()}.svg`; a.click();
  };

  const handleExport = async (format, includeBackground) => {
    if (format === 'figma') { exportFigmaSVG(); return; }
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
      if (window.html2canvas) {
        const canvas = await window.html2canvas(element, { backgroundColor: includeBackground ? '#f1f5f9' : null, scale: 2 });
        if (format === 'png') {
          const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `diagram_${Date.now()}.png`; a.click();
        } else if (format === 'pdf' && window.jspdf) {
          const imgData = canvas.toDataURL("image/png");
          const pdf = new window.jspdf.jsPDF('l', 'mm', 'a4');
          const pdfWidth = pdf.internal.pageSize.getWidth(); const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
          pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight); pdf.save(`diagram_${Date.now()}.pdf`);
        }
      } else alert("Failed to load export libraries. Check your internet connection.");
    } catch (e) { console.error("Export error:", e); alert("An error occurred during export."); } 
    finally {
      if (!includeBackground) element.style.background = bgOriginal;
      setTransform(oldTransform);
    }
  };

  const formatLabel = (htmlString) => {
    const safeStr = typeof htmlString === 'string' ? htmlString : String(htmlString || '');
    return safeStr.split(/<br\s*\/?>/i).map((line, i, arr) => (
      <React.Fragment key={i}>
        {line}
        {i !== arr.length - 1 && <br/>}
      </React.Fragment>
    ));
  };

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
            <div className="absolute top-full left-0 mt-2 w-56 bg-white border border-slate-200 shadow-xl rounded-lg overflow-hidden hidden group-hover:block transition-all">
              <div className="px-4 py-2 text-xs font-bold text-slate-400 bg-slate-50 uppercase tracking-wider border-b border-slate-100">Standard Export</div>
              <button onClick={() => handleExport('png', true)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm">Download as Image (PNG)</button>
              <button onClick={() => handleExport('pdf', true)} className="w-full text-left px-4 py-2 hover:bg-blue-50 text-sm border-b border-slate-100">Download as PDF</button>
              <div className="px-4 py-2 text-xs font-bold text-indigo-400 bg-indigo-50 uppercase tracking-wider border-b border-indigo-100">Vector Format</div>
              <button onClick={() => handleExport('figma', false)} className="w-full text-left px-4 py-3 hover:bg-indigo-100 text-sm font-bold text-indigo-700">Figma Compatible SVG</button>
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
          onWheel={handleWheel}
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
                      <text x="0" y="3" textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">✕</text>
                    </g>
                  </g>
                );
              })}
            </svg>

            {nodes.map(n => {
              const isSelected = selectedNodeId === n.id;
              let shapeStyles = { borderRadius: '8px' };
              if (n.shape === 'round') shapeStyles = { borderRadius: '9999px' };
              if (n.shape === 'diamond') shapeStyles = { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)', padding: '40px 30px', minWidth: '160px' };

              return (
                <div 
                  key={n.id}
                  onMouseDown={(e) => startDragNode(e, n.id)}
                  style={{
                    position: 'absolute',
                    left: n.x, top: n.y,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: n.fill,
                    color: n.color,
                    borderColor: isSelected ? '#3b82f6' : n.stroke,
                    borderWidth: isSelected ? '3px' : n.strokeWidth,
                    ...shapeStyles
                  }}
                  className={`
                    cursor-move min-w-[140px] min-h-[60px] p-4 text-center select-none flex items-center justify-center text-sm font-medium border-solid transition-colors shadow-md z-20 hover:shadow-lg
                    ${isSelected ? 'shadow-blue-200 shadow-xl z-30 ring-4 ring-blue-100' : ''}
                  `}
                >
                  <div>{formatLabel(n.label)}</div>
                  
                  {isSelected && (
                    <div 
                      className="absolute top-1/2 -right-4 transform -translate-y-1/2 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center cursor-crosshair shadow-lg hover:bg-blue-600 hover:scale-110 transition-all z-40"
                      onMouseDown={(e) => startDrawEdge(e, n.id)}
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
            })}
          </div>
        </div>
      </div>
    </div>
  );
}