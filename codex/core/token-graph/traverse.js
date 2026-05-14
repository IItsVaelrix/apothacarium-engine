import { stableTokenCompare } from './types.js';

function shouldReplacePath(existingPath, nextPath) {
  if (!existingPath) return true;
  if ((nextPath.activationScore || 0) !== (existingPath.activationScore || 0)) {
    return (nextPath.activationScore || 0) > (existingPath.activationScore || 0);
  }
  if ((nextPath.pathLength || 0) !== (existingPath.pathLength || 0)) {
    return (nextPath.pathLength || 0) < (existingPath.pathLength || 0);
  }
  return stableTokenCompare(nextPath.token, existingPath.token) < 0;
}

export function traverseTokenGraph(graph, activation) {
  const anchorNodeIds = Array.isArray(activation?.anchorNodeIds) ? activation.anchorNodeIds : [];
  if (anchorNodeIds.length === 0) return [];

  const queue = anchorNodeIds.map((nodeId) => ({
    nodeId,
    activationScore: Number(activation?.anchorWeights?.[nodeId]) || 0,
    depth: 0,
    anchorId: nodeId,
    pathNodes: [nodeId],
    pathEdges: [],
    visited: new Set([nodeId]),
  }));

  const bestPathByNodeId = new Map();

  while (queue.length > 0) {
    queue.sort((entryA, entryB) => {
      if ((entryB.activationScore || 0) !== (entryA.activationScore || 0)) {
        return (entryB.activationScore || 0) - (entryA.activationScore || 0);
      }
      return stableTokenCompare(entryA.nodeId, entryB.nodeId);
    });
    const current = queue.shift();
    if (!current) break;

    const node = graph?.nodes?.get?.(current.nodeId);
    if (!node) continue;

    const candidatePath = {
      nodeId: current.nodeId,
      token: node.token,
      normalized: node.normalized,
      activationScore: current.activationScore,
      anchorId: current.anchorId,
      pathLength: current.pathEdges.length,
      pathNodes: [...current.pathNodes],
      pathEdges: current.pathEdges.map((edge) => ({ ...edge })),
    };
    if (shouldReplacePath(bestPathByNodeId.get(current.nodeId), candidatePath)) {
      bestPathByNodeId.set(current.nodeId, candidatePath);
    }

    if (current.depth >= (activation?.maxDepth || 0)) continue;

    const edgeList = graph?.outgoing?.get?.(current.nodeId) || [];
    const boundedEdges = edgeList.slice(0, activation?.maxFanout || edgeList.length);

    boundedEdges.forEach((edge) => {
      if (!edge?.toId || current.visited.has(edge.toId)) return;
      const nextScore = current.activationScore * (Number(edge.weight) || 0) * (Number(activation?.decay) || 1);
      if (nextScore <= 0) return;
      queue.push({
        nodeId: edge.toId,
        activationScore: nextScore,
        depth: current.depth + 1,
        anchorId: current.anchorId,
        pathNodes: [...current.pathNodes, edge.toId],
        pathEdges: [...current.pathEdges, edge],
        visited: new Set([...current.visited, edge.toId]),
      });
    });
  }

  return [...bestPathByNodeId.values()]
    .sort((pathA, pathB) => {
      if ((pathB.activationScore || 0) !== (pathA.activationScore || 0)) {
        return (pathB.activationScore || 0) - (pathA.activationScore || 0);
      }
      return stableTokenCompare(pathA.token, pathB.token);
    });
}
