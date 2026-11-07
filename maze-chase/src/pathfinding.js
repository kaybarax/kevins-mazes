import { nodeAt, pointAt } from "./geometry.js";
class Heap {
  nodes = [];
  scores = [];
  push(node, score) {
    let i = this.nodes.length;
    this.nodes.push(node);
    this.scores.push(score);
    while (i) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= score) break;
      this.nodes[i] = this.nodes[parent];
      this.scores[i] = this.scores[parent];
      i = parent;
    }
    this.nodes[i] = node;
    this.scores[i] = score;
  }
  pop() {
    const result = this.nodes[0],
      node = this.nodes.pop(),
      score = this.scores.pop();
    if (this.nodes.length) {
      let i = 0;
      while (2 * i + 1 < this.nodes.length) {
        let child = 2 * i + 1;
        if (
          child + 1 < this.nodes.length &&
          this.scores[child + 1] < this.scores[child]
        )
          child++;
        if (this.scores[child] >= score) break;
        this.nodes[i] = this.nodes[child];
        this.scores[i] = this.scores[child];
        i = child;
      }
      this.nodes[i] = node;
      this.scores[i] = score;
    }
    return result;
  }
}
export function findPath(arena, from, to) {
  const start = nodeAt(arena, ...from),
    end = nodeAt(arena, ...to),
    cols = arena.cols;
  if (!arena.walk[start] || !arena.walk[end]) return [];
  const cost = new Float32Array(arena.walk.length);
  cost.fill(Infinity);
  const parent = new Int32Array(arena.walk.length);
  parent.fill(-1);
  const closed = new Uint8Array(arena.walk.length),
    heap = new Heap();
  const ex = end % cols,
    ey = Math.floor(end / cols);
  const heuristic = (i) =>
    Math.abs((i % cols) - ex) + Math.abs(Math.floor(i / cols) - ey);
  cost[start] = 0;
  heap.push(start, heuristic(start));
  while (heap.nodes.length) {
    const current = heap.pop();
    if (closed[current]) continue;
    if (current === end) {
      const path = [];
      let i = end;
      while (i !== -1) {
        path.push(pointAt(arena, i));
        i = parent[i];
      }
      return path.reverse();
    }
    closed[current] = 1;
    const x = current % cols;
    for (const next of [
      x ? current - 1 : -1,
      x < cols - 1 ? current + 1 : -1,
      current - cols,
      current + cols,
    ]) {
      if (
        next < 0 ||
        next >= arena.walk.length ||
        !arena.walk[next] ||
        closed[next]
      )
        continue;
      const g = cost[current] + 1;
      if (g < cost[next]) {
        cost[next] = g;
        parent[next] = current;
        heap.push(next, g + heuristic(next));
      }
    }
  }
  return [];
}
