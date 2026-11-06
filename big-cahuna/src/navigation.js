import { nodeAt, pointAt, clearLine, setInput, SPEED } from "./engine.js";
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
export function pathLength(path) {
  return path.length ? (path.length - 1) * 2 : Infinity;
}
export function createBot() {
  return {
    path: [],
    cursor: 0,
    target: null,
    targetIsExit: false,
    nextPlan: 0,
  };
}
export function steerBot(arena, match, p, brain, dt) {
  if (p.finishedAt !== null || match.status !== "racing") return;
  const remaining = match.duration - match.elapsed;
  if (
    !brain.path.length ||
    brain.cursor >= brain.path.length ||
    (!brain.targetIsExit && p.collected.includes(brain.target))
  ) {
    const exits = arena.exits.map((e) => ({
      id: "exit",
      point: [e.x, e.y],
      value: 0,
    }));
    const exitPaths = exits
      .map((e) => ({ ...e, path: findPath(arena, [p.x, p.y], e.point) }))
      .filter((e) => e.path.length);
    exitPaths.sort((a, b) => a.path.length - b.path.length);
    const escape = exitPaths[0];
    const mustExit =
      !escape ||
      remaining < (pathLength(escape.path) / SPEED) * 1.6 + 25 ||
      (p.bot === "racer" && p.collected.length >= 4);
    let candidates = [];
    if (!mustExit) {
      // Bound planning work: evaluate nearby candidates and the central prize.
      const nearby = arena.items
        .filter((i) => !p.collected.includes(i.id))
        .sort(
          (a, b) =>
            Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y),
        )
        .slice(0, 5);
      candidates = nearby
        .map((i) => ({
          id: i.id,
          value: i.value,
          path: findPath(arena, [p.x, p.y], pointAt(arena, i.node)),
        }))
        .filter((i) => i.path.length);
      candidates.sort(
        (a, b) =>
          (b.value + (p.slot === 2 && Number(b.id) % 3 === 0 ? 8 : 0)) /
            (pathLength(b.path) + 100) -
          (a.value + (p.slot === 2 && Number(a.id) % 3 === 0 ? 8 : 0)) /
            (pathLength(a.path) + 100),
      );
    }
    const chosen = candidates[0] || escape;
    if (!chosen) {
      setInput(p, { x: 0, y: 0 });
      return;
    }
    brain.path = chosen.path;
    brain.cursor = 0;
    brain.target = chosen.id;
    brain.targetIsExit = chosen.id === "exit";
  }
  while (
    brain.cursor < brain.path.length - 1 &&
    Math.hypot(
      p.x - brain.path[brain.cursor][0],
      p.y - brain.path[brain.cursor][1],
    ) < 1.5
  )
    brain.cursor++;
  // Look ahead only across clear segments; never cut through corners.
  let look = brain.cursor;
  while (
    look + 1 < brain.path.length &&
    look < brain.cursor + 8 &&
    clearLine(arena, p.x, p.y, ...brain.path[look + 1])
  )
    look++;
  const [x, y] = brain.path[look],
    dx = x - p.x,
    dy = y - p.y,
    d = Math.hypot(dx, dy);
  const speed = Math.min(1, d / (SPEED * dt));
  setInput(p, { x: d ? (dx / d) * speed : 0, y: d ? (dy / d) * speed : 0 });
  brain.cursor = look;
  if (d < 1 && look === brain.path.length - 1) brain.cursor = brain.path.length;
}
