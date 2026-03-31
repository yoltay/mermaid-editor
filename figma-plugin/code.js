// ==================================================
// Mermaid → FigJam Plugin — code.js v4
// ✓ Sections with appendChild (drag = children follow)
// ✓ 2-pass layout: nodes first, then sections sized to fit
// ✓ No overlap between subgraph groups
// ✓ Robust Mermaid parser (br tags, complex labels, &amp; etc.)
// ==================================================

figma.showUI(__html__, { width: 420, height: 520 });

// ─── PARSER ─────────────────────────────────────────

function parseMermaid(code) {
  var nodesMap = {};
  var edges = [];
  var subgraphs = {};
  var graphDirection = 'TB';
  var subgraphStack = [];

  function currentSg() {
    return subgraphStack.length > 0 ? subgraphStack[subgraphStack.length - 1] : null;
  }

  function ensureNode(id, label, shape) {
    id = id.trim();
    if (!id) return null;
    if (!nodesMap[id]) {
      nodesMap[id] = {
        id: id,
        label: (label || id).replace(/<br\s*\/?>/gi, '\n').replace(/&amp;/g, '&'),
        shape: shape || 'default',
        subgraph: currentSg()
      };
    } else {
      if (label && label !== id)
        nodesMap[id].label = label.replace(/<br\s*\/?>/gi, '\n').replace(/&amp;/g, '&');
      if (shape && shape !== 'default') nodesMap[id].shape = shape;
      if (currentSg() && !nodesMap[id].subgraph) nodesMap[id].subgraph = currentSg();
    }
    return nodesMap[id];
  }

  function parseNodeToken(raw) {
    raw = raw.trim().replace(/;$/, '');
    if (!raw) return null;
    var m = raw.match(/^([a-zA-Z0-9_]+)\s*([\[\(\{<][\[\(\{]?)\s*"?([\s\S]*?)"?\s*([\]\)\}>][\]\)\}>]?)\s*$/);
    if (m) {
      var open = m[2]; var shape = 'default';
      if (open === '(' || open === '([') shape = 'round';
      else if (open === '((') shape = 'round';
      else if (open === '{') shape = 'diamond';
      else if (open === '[(') shape = 'cylinder';
      return { id: m[1], label: m[3].trim() || m[1], shape: shape };
    }
    var plain = raw.match(/^([a-zA-Z0-9_]+)$/);
    if (plain) return { id: plain[1], label: null, shape: null };
    return null;
  }

  var edgeCounter = 0;
  function addEdge(srcId, tgtId, label, arrowType) {
    srcId = srcId.trim(); tgtId = tgtId.trim();
    if (!srcId || !tgtId) return;
    var style = 'solid';
    if (arrowType === '---') style = 'dashed';
    else if (arrowType === '-.->') style = 'dotted';
    else if (arrowType === '==>') style = 'thick';
    edges.push({ id: 'e' + (edgeCounter++), source: srcId, target: tgtId,
      label: (label || '').replace(/<br\s*\/?>/gi, ' ').replace(/"/g, ''), style: style });
  }

  // Join multi-line node definitions
  var rawLines = code.split('\n');
  var joined = []; var buffer = '';
  for (var ri = 0; ri < rawLines.length; ri++) {
    var rl = rawLines[ri].trim();
    if (!rl || rl.startsWith('%%')) continue;
    buffer = buffer ? (buffer + ' ' + rl) : rl;
    var opens = (buffer.match(/[\[\(\{]/g) || []).length;
    var closes = (buffer.match(/[\]\)\}]/g) || []).length;
    if (opens <= closes) { joined.push(buffer); buffer = ''; }
  }
  if (buffer) joined.push(buffer);

  // Main parse
  for (var i = 0; i < joined.length; i++) {
    var line = joined[i].trim();
    if (!line || line.startsWith('%%')) continue;
    if (line.startsWith('classDef ') || line.startsWith('class ') ||
        line.startsWith('style ') || line.startsWith('click ') ||
        line.startsWith('linkStyle ')) continue;

    if (line.startsWith('graph') || line.startsWith('flowchart')) {
      var dm = line.match(/(?:graph|flowchart)\s+(TB|BT|LR|RL|TD)/i);
      if (dm) graphDirection = dm[1].toUpperCase();
      continue;
    }
    if (line.startsWith('direction')) continue; // subgraph-local, skip

    var sgm = line.match(/^subgraph\s+([a-zA-Z0-9_]+)(?:\s*\[\s*"?([\s\S]*?)"?\s*\])?\s*$/);
    if (sgm) {
      subgraphs[sgm[1]] = { id: sgm[1], label: sgm[2] || sgm[1], parent: currentSg() };
      subgraphStack.push(sgm[1]);
      continue;
    }
    if (line === 'end') { subgraphStack.pop(); continue; }

    // Edge line?
    if (line.indexOf('-->') !== -1 || line.indexOf('---') !== -1 ||
        line.indexOf('-.->') !== -1 || line.indexOf('==>') !== -1) {
      parseEdgeLine(line);
      continue;
    }

    var nd = parseNodeToken(line);
    if (nd) ensureNode(nd.id, nd.label, nd.shape);
  }

  function parseEdgeLine(line) {
    var arrowPattern = /(-->|---|-.->|==>)\s*(?:\|\s*"?([^|]*?)"?\s*\|)?\s*/g;
    var arrows = []; var am;
    while ((am = arrowPattern.exec(line)) !== null) {
      arrows.push({ index: am.index, endIndex: am.index + am[0].length, type: am[1], label: am[2] || '' });
    }
    if (arrows.length === 0) return;

    var srcToken = line.substring(0, arrows[0].index).trim();
    for (var ai = 0; ai < arrows.length; ai++) {
      var arrow = arrows[ai];
      var tgtEnd = (ai + 1 < arrows.length) ? arrows[ai + 1].index : line.length;
      var tgtPart = line.substring(arrow.endIndex, tgtEnd).trim();

      var tgtTokens = tgtPart.split('&').map(function(t) { return t.trim(); });
      for (var ti = 0; ti < tgtTokens.length; ti++) {
        var tgt = tgtTokens[ti]; if (!tgt) continue;
        var sp = parseNodeToken(srcToken), srcId;
        if (sp) { srcId = sp.id; ensureNode(srcId, sp.label, sp.shape); }
        else { srcId = srcToken.trim(); if (srcId && !subgraphs[srcId]) ensureNode(srcId); }

        var tp = parseNodeToken(tgt), tgtId;
        if (tp) { tgtId = tp.id; ensureNode(tgtId, tp.label, tp.shape); }
        else { tgtId = tgt.trim(); if (tgtId && !subgraphs[tgtId]) ensureNode(tgtId); }

        if (srcId && tgtId) addEdge(srcId, tgtId, arrow.label, arrow.type);
      }
      if (tgtTokens.length > 0) {
        var nsp = parseNodeToken(tgtTokens[0]);
        srcToken = nsp ? nsp.id : tgtTokens[0].trim();
      }
    }
  }

  // Build node list (exclude subgraph IDs)
  var nodeList = [];
  var nk = Object.keys(nodesMap);
  for (var ni = 0; ni < nk.length; ni++) {
    if (!subgraphs[nk[ni]]) nodeList.push(nodesMap[nk[ni]]);
  }

  // Resolve subgraph edges
  var resolvedEdges = [];
  for (var ei = 0; ei < edges.length; ei++) {
    var e = edges[ei];
    var rs = subgraphs[e.source] ? findRep(e.source, nodeList, subgraphs, 'last') : e.source;
    var rt = subgraphs[e.target] ? findRep(e.target, nodeList, subgraphs, 'first') : e.target;
    if (rs && rt) resolvedEdges.push({ id: e.id, source: rs, target: rt, label: e.label, style: e.style });
  }

  return { nodes: nodeList, edges: resolvedEdges, subgraphs: subgraphs, graphDirection: graphDirection };
}

function findRep(sgId, nodes, subgraphs, which) {
  var allSgs = []; (function collect(id) { allSgs.push(id); var ks = Object.keys(subgraphs);
    for (var i = 0; i < ks.length; i++) { if (subgraphs[ks[i]].parent === id) collect(ks[i]); }
  })(sgId);
  var found = [];
  for (var i = 0; i < nodes.length; i++) { if (allSgs.indexOf(nodes[i].subgraph) !== -1) found.push(nodes[i].id); }
  if (found.length === 0) return null;
  return which === 'first' ? found[0] : found[found.length - 1];
}


// ─── HIERARCHICAL LAYOUT (subgraph-aware) ───────────

function buildLayout(nodes, edges, subgraphs, direction) {
  if (nodes.length === 0) return {};

  var NODE_W = 220, NODE_H = 70, GAP_X = 70, GAP_Y = 100;
  var SG_PAD = 50, SG_TITLE_H = 35;
  var isH = (direction === 'LR' || direction === 'RL');

  // Step 1: Assign topological levels
  var children = {}, inDeg = {};
  for (var i = 0; i < nodes.length; i++) { children[nodes[i].id] = []; inDeg[nodes[i].id] = 0; }
  for (var i = 0; i < edges.length; i++) {
    if (children[edges[i].source]) children[edges[i].source].push(edges[i].target);
    if (inDeg[edges[i].target] !== undefined) inDeg[edges[i].target]++;
  }

  var queue = [], level = {};
  for (var i = 0; i < nodes.length; i++) {
    if (inDeg[nodes[i].id] === 0) { queue.push(nodes[i].id); level[nodes[i].id] = 0; }
  }
  var head = 0;
  while (head < queue.length) {
    var c = queue[head++], adj = children[c] || [];
    for (var j = 0; j < adj.length; j++) {
      if (inDeg[adj[j]] === undefined) continue;
      inDeg[adj[j]]--;
      var nl = (level[c] || 0) + 1;
      if (level[adj[j]] === undefined || nl > level[adj[j]]) level[adj[j]] = nl;
      if (inDeg[adj[j]] === 0) queue.push(adj[j]);
    }
  }
  for (var i = 0; i < nodes.length; i++) { if (level[nodes[i].id] === undefined) level[nodes[i].id] = 0; }

  // Step 2: Group by level, sort by parent median
  var groups = {};
  for (var i = 0; i < nodes.length; i++) {
    var lv = level[nodes[i].id];
    if (!groups[lv]) groups[lv] = [];
    groups[lv].push(nodes[i]);
  }

  var sortedLvls = Object.keys(groups).map(Number).sort(function(a,b){return a-b;});
  var pos = {};

  for (var li = 0; li < sortedLvls.length; li++) {
    var lk = sortedLvls[li], grp = groups[lk];
    if (li > 0) {
      grp.sort(function(a, b) { return mpar(a.id) - mpar(b.id); });
    }
    var cnt = grp.length;
    for (var ni = 0; ni < cnt; ni++) {
      var off = ni - (cnt - 1) / 2;
      if (isH) { pos[grp[ni].id] = { x: lk * (NODE_W + GAP_X), y: off * (NODE_H + GAP_Y) }; }
      else     { pos[grp[ni].id] = { x: off * (NODE_W + GAP_X), y: lk * (NODE_H + GAP_Y) }; }
    }
  }

  function mpar(nid) {
    var vs = [];
    for (var e = 0; e < edges.length; e++) {
      if (edges[e].target === nid && pos[edges[e].source])
        vs.push(isH ? pos[edges[e].source].y : pos[edges[e].source].x);
    }
    if (vs.length === 0) return 0;
    vs.sort(function(a,b){return a-b;});
    return vs[Math.floor(vs.length / 2)];
  }

  // Step 3: Normalize to positive
  var allX = [], allY = [], pk = Object.keys(pos);
  for (var i = 0; i < pk.length; i++) { allX.push(pos[pk[i]].x); allY.push(pos[pk[i]].y); }
  if (allX.length > 0) {
    var mnX = Math.min.apply(null, allX), mnY = Math.min.apply(null, allY);
    for (var i = 0; i < pk.length; i++) { pos[pk[i]].x -= mnX - 200; pos[pk[i]].y -= mnY - 200; }
  }

  return pos;
}


// ─── SECTION BOUNDS CALCULATOR ──────────────────────

function calcBounds(sgId, subgraphs, nodes, pos, NW, NH) {
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  // Collect this sg + all descendants
  var allSgs = []; (function collect(id) { allSgs.push(id);
    var ks = Object.keys(subgraphs);
    for (var i = 0; i < ks.length; i++) { if (subgraphs[ks[i]].parent === id) collect(ks[i]); }
  })(sgId);

  for (var i = 0; i < nodes.length; i++) {
    if (allSgs.indexOf(nodes[i].subgraph) !== -1) {
      var p = pos[nodes[i].id];
      if (p) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x + NW > maxX) maxX = p.x + NW;
        if (p.y + NH > maxY) maxY = p.y + NH;
      }
    }
  }

  var PAD = 50;
  return { minX: minX - PAD, minY: minY - PAD - 35, maxX: maxX + PAD, maxY: maxY + PAD };
}


// ─── SHAPE CONFIG ───────────────────────────────────

var FILLS = {
  'default':  { r: 0.92, g: 0.94, b: 1.0 },
  'round':    { r: 0.87, g: 0.96, b: 0.89 },
  'diamond':  { r: 1.0,  g: 0.95, b: 0.82 },
  'cylinder': { r: 0.93, g: 0.88, b: 1.0  }
};
var SHAPES = { 'default': 'ROUNDED_RECTANGLE', 'round': 'ELLIPSE', 'diamond': 'DIAMOND', 'cylinder': 'ENG_DATABASE' };


// ─── CREATE DIAGRAM ─────────────────────────────────

async function createDiagram(parsed, nodeStyle) {
  var nodes = parsed.nodes, edges = parsed.edges, sgs = parsed.subgraphs;
  var pos = buildLayout(nodes, edges, sgs, parsed.graphDirection);
  var NW = 220, NH = 70;
  var figNodes = {};

  // ── Build subgraph tree (leaves first) ──
  var sgOrder = []; var sgVisited = {};
  function visitSg(id) {
    if (sgVisited[id]) return; sgVisited[id] = true;
    var ks = Object.keys(sgs);
    for (var i = 0; i < ks.length; i++) { if (sgs[ks[i]].parent === id) visitSg(ks[i]); }
    sgOrder.push(id);
  }
  var sgRoots = Object.keys(sgs);
  for (var i = 0; i < sgRoots.length; i++) { if (!sgs[sgRoots[i]].parent) visitSg(sgRoots[i]); }
  // sgOrder is now leaves-first, roots-last

  // ── Create Sections (leaves first so inner sections exist before outer ones) ──
  var sectionMap = {}; // sgId → { section, bounds }

  for (var si = 0; si < sgOrder.length; si++) {
    var sgId = sgOrder[si];
    var bounds = calcBounds(sgId, sgs, nodes, pos, NW, NH);
    if (bounds.minX >= Infinity) continue;

    var section = figma.createSection();
    section.name = sgs[sgId].label || sgId;

    // If this section has a parent section, append to parent; else to page
    var parentSgId = sgs[sgId].parent;
    if (parentSgId && sectionMap[parentSgId]) {
      var parentSection = sectionMap[parentSgId].section;
      var parentBounds = sectionMap[parentSgId].bounds;
      // Position relative to parent section's top-left
      section.x = bounds.minX - parentBounds.minX;
      section.y = bounds.minY - parentBounds.minY;
      section.resizeWithoutConstraints(
        Math.max(bounds.maxX - bounds.minX, 300),
        Math.max(bounds.maxY - bounds.minY, 200)
      );
      parentSection.appendChild(section);
    } else {
      section.x = bounds.minX;
      section.y = bounds.minY;
      section.resizeWithoutConstraints(
        Math.max(bounds.maxX - bounds.minX, 300),
        Math.max(bounds.maxY - bounds.minY, 200)
      );
      figma.currentPage.appendChild(section);
    }

    sectionMap[sgId] = { section: section, bounds: bounds };
  }

  // ── Create Nodes ──
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    var p = pos[node.id];
    if (!p) continue;

    try {
      var figNode;

      if (nodeStyle === 'sticky') {
        figNode = figma.createSticky();
        await figma.loadFontAsync(figNode.text.fontName);
        figNode.text.characters = node.label;
      } else {
        figNode = figma.createShapeWithText();
        figNode.shapeType = SHAPES[node.shape] || 'ROUNDED_RECTANGLE';

        var labelLen = node.label.length;
        var w = Math.max(NW, Math.min(labelLen * 5.5 + 40, 360));
        var h = NH;
        var lc = (node.label.match(/\n/g) || []).length + 1;
        if (lc > 1) h = Math.max(NH, lc * 18 + 30);

        if (node.shape === 'diamond') figNode.resize(Math.max(w, h * 1.4), Math.max(h, w * 0.7));
        else if (node.shape === 'cylinder') figNode.resize(w * 0.8, h * 1.2);
        else figNode.resize(w, h);

        await figma.loadFontAsync(figNode.text.fontName);
        figNode.text.characters = node.label;
        figNode.fills = [{ type: 'SOLID', color: FILLS[node.shape] || FILLS['default'] }];
      }

      // Find the deepest section this node belongs to
      var nodeSg = node.subgraph;
      if (nodeSg && sectionMap[nodeSg]) {
        var sec = sectionMap[nodeSg];
        // Position relative to the section's top-left corner
        figNode.x = p.x - sec.bounds.minX;
        figNode.y = p.y - sec.bounds.minY;
        sec.section.appendChild(figNode);
      } else {
        figNode.x = p.x;
        figNode.y = p.y;
        figma.currentPage.appendChild(figNode);
      }

      figNodes[node.id] = figNode;
    } catch (e) {
      console.log('Node error ' + node.id + ':', e);
    }
  }

  // ── Create Connectors ──
  var connCount = 0;
  for (var i = 0; i < edges.length; i++) {
    var edge = edges[i];
    var sf = figNodes[edge.source], tf = figNodes[edge.target];
    if (!sf || !tf) continue;

    try {
      var conn = figma.createConnector();
      conn.connectorStart = { endpointNodeId: sf.id, magnet: 'AUTO' };
      conn.connectorEnd = { endpointNodeId: tf.id, magnet: 'AUTO' };
      conn.connectorEndStrokeCap = 'ARROW_LINES';

      if (edge.label) {
        await figma.loadFontAsync(conn.text.fontName);
        conn.text.characters = edge.label;
      }
      if (edge.style === 'dashed' || edge.style === 'dotted') conn.dashPattern = [8, 4];
      if (edge.style === 'thick') conn.strokeWeight = 3;

      figma.currentPage.appendChild(conn);
      connCount++;
    } catch (e) { console.log('Connector error:', e); }
  }

  // ── Zoom to fit ──
  var all = [];
  var fk = Object.keys(figNodes);
  for (var i = 0; i < fk.length; i++) all.push(figNodes[fk[i]]);
  // Also add root sections
  for (var i = 0; i < sgOrder.length; i++) {
    if (!sgs[sgOrder[i]].parent && sectionMap[sgOrder[i]]) {
      all.push(sectionMap[sgOrder[i]].section);
    }
  }
  if (all.length > 0) figma.viewport.scrollAndZoomIntoView(all);

  return { nodeCount: nodes.length, edgeCount: connCount };
}


// ─── MESSAGE HANDLER ────────────────────────────────

figma.ui.onmessage = async function(msg) {
  if (msg.type === 'generate') {
    try {
      var parsed = parseMermaid(msg.code);
      if (parsed.nodes.length === 0) {
        figma.ui.postMessage({ type: 'error', message: 'Düğüm bulunamadı. Kodu kontrol edin.' });
        return;
      }
      var result = await createDiagram(parsed, msg.nodeStyle);
      figma.ui.postMessage({ type: 'success', nodeCount: result.nodeCount, edgeCount: result.edgeCount });
      figma.notify(result.nodeCount + ' düğüm, ' + result.edgeCount + ' bağlantı oluşturuldu!');
    } catch (err) {
      console.error('Plugin error:', err);
      figma.ui.postMessage({ type: 'error', message: err.message || 'Bilinmeyen hata.' });
    }
  }
};
