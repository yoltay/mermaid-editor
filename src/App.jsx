import React, { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, GripHorizontal, MousePointer2 } from 'lucide-react';

// --- Parser & Generator Functions ---
const parseMermaid = (code, existingNodes) => {
  const lines = code.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%'));
  const nodesMap = {};
  const edges = [];
  let edgeCounter = 0;

  const getOrCreateNode = (id, label, shape) => {
    if (!nodesMap[id]) {
      const ex = existingNodes.find(n => n.id === id);
      nodesMap[id] = {
        id,
        label: label || id,
        shape: shape || 'default',
        x: ex?.x,
        y: ex?.y,
        fill: ex?.fill || '#ffffff',
        color: ex?.color || '#1e293b'
      };
    } else {
      if (label) nodesMap[id].label = label;
      if (shape) nodesMap[id].shape = shape;
    }
  };

  const nodeRegex = /([a-zA-Z0-9_\-]+)(?:(\[|\(|\{)(?:")?(.*?)(?:")?(\]|\)|\}))?/;

  lines.forEach(line => {
    if (line.startsWith('graph') || line.startsWith('flowchart')) return;

    if (line.startsWith('style ')) {
      const styleMatch = line.match(/style\s+([a-zA-Z0-9_\-]+)\s+(.+)/);
      if (styleMatch) {
        const id = styleMatch[1];
        if (nodesMap[id]) {
          styleMatch[2].split(',').forEach(s => {
            const [k, v] = s.split(':').map(x => x.trim());
            if (k === 'fill') nodesMap[id].fill = v;
            if (k === 'color') nodesMap[id].color = v;
          });
        }
      }
      return;
    }

    const edgeMatch = line.match(/^(.*?)\s*(-->|---|-.->|==>)\s*(?:\|(.*?)\|)?\s*(.*?)$/);
    if (edgeMatch) {
      const srcStr = edgeMatch[1].trim();
      const label = edgeMatch[3] || '';
      const tgtStr = edgeMatch[4].trim();

      const srcM = srcStr.match(nodeRegex);
      const tgtM = tgtStr.match(nodeRegex);

      if (srcM && tgtM) {
        const sId = srcM[1];
        const sShape = srcM[2] === '(' ? 'round' : srcM[2] === '{' ? 'diamond' : 'default';
        getOrCreateNode(sId, srcM[3], sShape);

        const tId = tgtM[1];
        const tShape = tgtM[2] === '(' ? 'round' : tgtM[2] === '{' ? 'diamond' : 'default';
        getOrCreateNode(tId, tgtM[3], tShape);

        edges.push({ id: `e${edgeCounter++}`, source: sId, target: tId, label });
      }
    } else {
      const match = line.match(nodeRegex);
      if (match) {
        const shape = match[2] === '(' ? 'round' : match[2] === '{' ? 'diamond' : 'default';
        getOrCreateNode(match[1], match[3], shape);
      }
    }
  });

  const newNodes = Object.values(nodesMap);
  
  // Izgara yerleşimi (yeni düğümler için)
  let layX = 200, layY = 150;
  newNodes.forEach(n => {
    if (n.x === undefined) {
      n.x = layX;
      n.y = layY;
      layX += 250;
      if (layX > 800) { layX = 200; layY += 150; }
    }
  });

  return { newNodes, newEdges: edges };
};

const generateMermaid = (nodes, edges) => {
  let code = "graph TD\n";
  nodes.forEach(n => {
    let open = '[', close = ']';
    if (n.shape === 'round') { open = '('; close = ')'; }
    if (n.shape === 'diamond') { open = '{'; close = '}'; }
    
    const label = n.label.replace(/["\n]/g, ' '); 
    code += `  ${n.id}${open}"${label}"${close}\n`;
    
    if (n.fill !== '#ffffff' || n.color !== '#1e293b') {
      code += `  style ${n.id} fill:${n.fill},color:${n.color}\n`;
    }
  });
  
  edges.forEach(e => {
    const edgeStr = e.label ? `-->|"${e.label}"|` : `-->`;
    code += `  ${e.source} ${edgeStr} ${e.target}\n`;
  });
  
  return code;
};

const defaultCode = `graph TD
  A[Ana Fikir]
  B(Fikir 1)
  C(Fikir 2)
  D{Uygulanabilir mi?}
  E[Hemen Başla]
  F[Daha Fazla Araştır]
  A --> B
  A --> C
  B --> D
  C --> D
  D -->|Evet| E
  D -->|Hayır| F
  style A fill:#3b82f6,color:#ffffff
  style D fill:#f59e0b,color:#ffffff
  style E fill:#10b981,color:#ffffff
  style F fill:#ef4444,color:#ffffff`;

export default function App() {
  const [textCode, setTextCode] = useState(defaultCode);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const dragInfo = useRef({ id: null, offsetX: 0, offsetY: 0 });
  const boardRef = useRef(null);

  useEffect(() => {
    const { newNodes, newEdges } = parseMermaid(textCode, []);
    setNodes(newNodes);
    setEdges(newEdges);
  }, []);

  const handleTextChange = (e) => {
    const val = e.target.value;
    setTextCode(val);
    const { newNodes, newEdges } = parseMermaid(val, nodes);
    setNodes(newNodes);
    setEdges(newEdges);
  };

  const startDrag = (e, id) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelectedNodeId(id);
    
    const boardRect = boardRef.current.getBoundingClientRect();
    const mouseX = e.clientX - boardRect.left + boardRef.current.scrollLeft;
    const mouseY = e.clientY - boardRect.top + boardRef.current.scrollTop;
    
    const node = nodes.find(n => n.id === id);
    dragInfo.current = { id, offsetX: mouseX - node.x, offsetY: mouseY - node.y };
    setIsDragging(true);
  };

  const onMouseMove = (e) => {
    if (!isDragging || !dragInfo.current.id) return;
    
    const boardRect = boardRef.current.getBoundingClientRect();
    const mouseX = e.clientX - boardRect.left + boardRef.current.scrollLeft;
    const mouseY = e.clientY - boardRect.top + boardRef.current.scrollTop;
    
    const newX = mouseX - dragInfo.current.offsetX;
    const newY = mouseY - dragInfo.current.offsetY;
    
    setNodes(prev => prev.map(n => n.id === dragInfo.current.id ? { ...n, x: newX, y: newY } : n));
  };

  const onMouseUp = () => {
    if (isDragging) {
      setIsDragging(false);
      dragInfo.current = { id: null, offsetX: 0, offsetY: 0 };
    }
  };

  const updateNodeStyle = (id, changes) => {
    const updatedNodes = nodes.map(n => n.id === id ? { ...n, ...changes } : n);
    setNodes(updatedNodes);
    setTextCode(generateMermaid(updatedNodes, edges));
  };

  const addNode = () => {
    const id = `Node${Date.now().toString().slice(-4)}`;
    const newNode = {
      id, label: 'Yeni Düğüm', shape: 'default',
      x: 300, y: 300, fill: '#ffffff', color: '#1e293b'
    };
    const updatedNodes = [...nodes, newNode];
    setNodes(updatedNodes);
    setTextCode(generateMermaid(updatedNodes, edges));
    setSelectedNodeId(id);
  };

  const deleteNode = (id) => {
    const updatedNodes = nodes.filter(n => n.id !== id);
    const updatedEdges = edges.filter(e => e.source !== id && e.target !== id);
    setNodes(updatedNodes);
    setEdges(updatedEdges);
    setTextCode(generateMermaid(updatedNodes, updatedEdges));
    if (selectedNodeId === id) setSelectedNodeId(null);
  };

  const addEdge = (sourceId, targetId) => {
    if(!targetId) return;
    const newEdges = [...edges, { id: `e${Date.now()}`, source: sourceId, target: targetId, label: '' }];
    setEdges(newEdges);
    setTextCode(generateMermaid(nodes, newEdges));
  };

  const deleteEdge = (edgeId) => {
    const updatedEdges = edges.filter(e => e.id !== edgeId);
    setEdges(updatedEdges);
    setTextCode(generateMermaid(nodes, updatedEdges));
  };

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  return (
    <div className="flex h-screen w-full bg-slate-100 text-slate-800 font-sans overflow-hidden">
      
      {/* Sol Panel: Metin Editörü */}
      <div className="w-1/4 min-w-[300px] border-r border-slate-300 bg-white flex flex-col z-10 shadow-lg">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
          <h2 className="font-bold text-slate-700 flex items-center gap-2">
            <span className="bg-blue-600 text-white p-1 rounded"><MousePointer2 size={16}/></span>
            Mermaid Kodu
          </h2>
        </div>
        <textarea
          value={textCode}
          onChange={handleTextChange}
          className="flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none bg-slate-50 text-slate-700 whitespace-pre"
          spellCheck="false"
        />
        <div className="p-4 bg-slate-100 text-xs text-slate-500 border-t border-slate-200">
          <p className="mb-2"><strong>Bilgi:</strong> Akış şeması (graph TD/LR) formatını destekler.</p>
          <p>Düğümleri sağdaki tahtadan sürükleyerek taşıyabilir, tıklayarak renk ve şekillerini değiştirebilirsiniz.</p>
        </div>
      </div>

      {/* Sağ Panel: İnteraktif Tahta */}
      <div className="flex-1 relative overflow-hidden flex flex-col">
        {/* Tahta Araç Çubuğu */}
        <div className="absolute top-4 left-4 z-20 flex gap-2">
          <button 
            onClick={addNode}
            className="bg-white border border-slate-300 shadow-sm px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-slate-50 font-medium transition-colors"
          >
            <Plus size={18} className="text-blue-600"/> Yeni Düğüm Ekle
          </button>
        </div>

        {/* Seçili Düğüm Ayar Paneli */}
        {selectedNode && (
          <div className="absolute top-4 right-4 bg-white p-5 rounded-xl shadow-2xl border border-slate-200 w-72 z-30 animate-in slide-in-from-right-4 fade-in">
            <h3 className="font-bold mb-4 text-slate-800 border-b pb-2 flex justify-between items-center">
              Düğüm Düzenle
              <span className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-500">{selectedNode.id}</span>
            </h3>
            
            <label className="block text-sm font-medium mb-1 text-slate-600">Metin</label>
            <input 
              type="text" 
              value={selectedNode.label} 
              onChange={(e) => updateNodeStyle(selectedNode.id, { label: e.target.value })}
              className="w-full border border-slate-300 p-2 rounded-md mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
            />
            
            <label className="block text-sm font-medium mb-1 text-slate-600">Şekil</label>
            <select 
              value={selectedNode.shape}
              onChange={(e) => updateNodeStyle(selectedNode.id, { shape: e.target.value })}
              className="w-full border border-slate-300 p-2 rounded-md mb-4 outline-none"
            >
              <option value="default">Dikdörtgen</option>
              <option value="round">Yuvarlak</option>
              <option value="diamond">Elmas (Karar)</option>
            </select>

            <div className="flex gap-4 mb-5">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1 text-slate-600">Arka Plan</label>
                <div className="flex items-center gap-2 border border-slate-300 rounded-md p-1">
                  <input 
                    type="color" 
                    value={selectedNode.fill} 
                    onChange={(e) => updateNodeStyle(selectedNode.id, { fill: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                  <span className="text-xs font-mono uppercase text-slate-500">{selectedNode.fill}</span>
                </div>
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1 text-slate-600">Yazı</label>
                <div className="flex items-center gap-2 border border-slate-300 rounded-md p-1">
                  <input 
                    type="color" 
                    value={selectedNode.color} 
                    onChange={(e) => updateNodeStyle(selectedNode.id, { color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                  />
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-4 mb-4">
              <label className="block text-sm font-medium mb-2 text-slate-600">Buna Bağlantı Ekle</label>
              <select 
                onChange={(e) => {
                  if(e.target.value) {
                    addEdge(selectedNode.id, e.target.value);
                    e.target.value = '';
                  }
                }}
                className="w-full border border-slate-300 p-2 rounded-md outline-none text-sm"
                defaultValue=""
              >
                <option value="" disabled>Hedef Düğüm Seç...</option>
                {nodes.filter(n => n.id !== selectedNode.id).map(n => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </select>
            </div>

            <button 
              onClick={() => deleteNode(selectedNode.id)}
              className="w-full bg-red-50 text-red-600 p-2 rounded-md flex items-center justify-center gap-2 hover:bg-red-100 transition-colors border border-red-200 font-medium"
            >
              <Trash2 size={16} /> Düğümü Sil
            </button>
          </div>
        )}

        {/* Scroll Edilebilir Çalışma Alanı */}
        <div 
          ref={boardRef}
          className="flex-1 overflow-auto bg-slate-100 relative"
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          onMouseDown={(e) => {
            if (e.target === boardRef.current || e.target.tagName === 'svg') {
              setSelectedNodeId(null);
            }
          }}
        >
          {/* Sonsuzluk hissi veren arka plan gridi */}
          <div 
            className="absolute top-0 left-0 w-[3000px] h-[3000px]"
            style={{
              backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)',
              backgroundSize: '30px 30px'
            }}
          >
            {/* Kenarlar (SVG) */}
            <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
              <defs>
                <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                  <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
                </marker>
              </defs>
              {edges.map(e => {
                const src = nodes.find(n => n.id === e.source);
                const tgt = nodes.find(n => n.id === e.target);
                if (!src || !tgt) return null;

                // Okun düğümün altında kalmaması için çizgiyi biraz kısaltıyoruz (Yarıçap tahmini ~50px)
                const dx = tgt.x - src.x;
                const dy = tgt.y - src.y;
                const dist = Math.sqrt(dx*dx + dy*dy);
                const R = 60; 
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
                      stroke="#94a3b8" strokeWidth="2.5" 
                      markerEnd="url(#arrowhead)" 
                    />
                    
                    {/* Bağlantı Etiketi */}
                    {e.label && (
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect x="-30" y="-12" width="60" height="24" fill="#f8fafc" rx="4" stroke="#e2e8f0" />
                        <text x="0" y="4" textAnchor="middle" fill="#475569" fontSize="12" className="pointer-events-none font-medium">{e.label}</text>
                      </g>
                    )}

                    {/* Çizgiyi Silme Butonu (Görünmez Hitbox + Çarpı) */}
                    <g 
                      transform={`translate(${midX}, ${midY - (e.label ? 20 : 0)})`}
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

            {/* Düğümler (HTML Divs) */}
            {nodes.map(n => {
              const isSelected = selectedNodeId === n.id;
              
              // Şekil Stilleri
              let shapeStyles = { borderRadius: '8px' };
              if (n.shape === 'round') shapeStyles = { borderRadius: '9999px' };
              if (n.shape === 'diamond') shapeStyles = { 
                clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                padding: '30px 20px',
                minWidth: '140px'
              };

              return (
                <div 
                  key={n.id}
                  onMouseDown={(e) => startDrag(e, n.id)}
                  style={{
                    position: 'absolute',
                    left: n.x, top: n.y,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: n.fill,
                    color: n.color,
                    ...shapeStyles
                  }}
                  className={`
                    cursor-move min-w-[120px] min-h-[50px] p-4 text-center shadow-md select-none flex items-center justify-center font-medium border-2 transition-shadow
                    ${isSelected ? 'border-blue-500 shadow-blue-200 shadow-xl z-20' : 'border-transparent hover:border-slate-300 z-10'}
                  `}
                >
                  {n.label}
                  
                  {/* Seçili ise sürükleme ikonu göster */}
                  {isSelected && (
                    <div className="absolute -top-3 -right-3 bg-white p-1 rounded-full shadow border text-slate-400">
                      <GripHorizontal size={14} />
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
