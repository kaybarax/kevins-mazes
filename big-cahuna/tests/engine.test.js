import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeArena, createPlayer, createMatch, stepMatch, setInput, ranking, canStand, clearLine, SPEED } from '../src/engine.js';
import { findPath, createBot, steerBot } from '../src/navigation.js';
const arena = decodeArena(JSON.parse(readFileSync(new URL('../src/arena.json', import.meta.url))));
test('every collectible and both exits are reachable from both starts', () => {
  for (const start of arena.starts) {
    for (const item of arena.items) assert.ok(findPath(arena, start, [item.x,item.y]).length, item.kind + item.id);
    for (const exit of arena.exits) assert.ok(findPath(arena, start, [exit.x, exit.y]).length, 'exit');
  }
  assert.equal(arena.doors.length, 5);
});
test('movement cannot tunnel through walls, exceed speed, or leave the arena', () => {
  const p = createPlayer(arena, 'p', 'Player', 0), match = createMatch(arena, [p]);
  setInput(p, { x: 9999, y: 9999 });
  for (let i=0;i<1000;i++) {
    const x=p.x,y=p.y; stepMatch(arena,match,.05);
    assert.ok(canStand(arena,p.x,p.y));
    assert.ok(Math.hypot(p.x-x,p.y-y)<=SPEED*.05+.001);
  }
  // A solid one-cell wall must stop even an oversized time step.
  const box={step:1,cols:30,rows:30,walk:new Uint8Array(900).fill(1),starts:[[10,15]],items:[],exits:[]};
  for(let y=0;y<30;y++)box.walk[y*30+15]=0;
  const q=createPlayer(box,'q','Q',0),barrier=createMatch(box,[q]);setInput(q,{x:1,y:0});stepMatch(box,barrier,1000);
  assert.ok(q.x<15);assert.ok(canStand(box,q.x,q.y));
  setInput(p,{x:NaN,y:Infinity});assert.ok(Number.isFinite(p.input.x));
});
test('items score once per player, independently; watching stops movement while time advances', () => {
  const players=[createPlayer(arena,'a','A',0),createPlayer(arena,'b','B',1)];
  const item=arena.items[0];for(const p of players){p.x=item.x;p.y=item.y;}
  const match=createMatch(arena,players);stepMatch(arena,match,.05);stepMatch(arena,match,.05);
  for(const p of players){assert.equal(p.score,item.value);assert.deepEqual(p.collected,[item.id]);}
  const p=players[0];p.watching=true;const old=[p.x,p.y];setInput(p,{x:1,y:1});stepMatch(arena,match,.05);
  assert.deepEqual([p.x,p.y],old);assert.ok(match.elapsed>.1);
});
test('finishers outrank non-finishers; points lead, then time; deadline freezes match', () => {
  const ps=[createPlayer(arena,'a','A',0),createPlayer(arena,'b','B',1),createPlayer(arena,'c','C',2)];
  ps[0].score=10;ps[0].finishedAt=30;ps[1].score=10;ps[1].finishedAt=20;ps[2].score=999;
  const m=createMatch(arena,ps,.1);assert.deepEqual(ranking(m).map(p=>p.id),['b','a','c']);
  stepMatch(arena,m,.1);assert.equal(m.status,'finished');const before=JSON.stringify(m);stepMatch(arena,m,.1);assert.equal(JSON.stringify(m),before);
});
test('a cautious bot collects prizes and escapes legally before the deadline', () => {
  const p=createPlayer(arena,'bot','Bot',0,'racer'),m=createMatch(arena,[p]),brain=createBot();
  for(let i=0;i<10000&&m.status==='racing';i++){steerBot(arena,m,p,brain,.05);stepMatch(arena,m,.05);assert.ok(canStand(arena,p.x,p.y));}
  assert.notEqual(p.finishedAt,null);assert.ok(p.score>0);assert.ok(p.finishedAt<480);
});
