// What the runner does in the packing scene, as a small deterministic state machine. Scroll sets
// how many items should be in the box (target) and whether to seal it; the runner chases that in
// real time: runs to a shelf, lifts the item overhead, runs to the box, tosses it in, and back
// the other way when the visitor scrolls up. With everything packed and seal on, he closes the
// lid, lights the fuse and runs to a safe spot. No drawing here, see packing.js.

import { dirOf } from './runner.js';

export const TIMES = Object.freeze({
  lift: 210, // shelf to overhead
  put: 190, // overhead back onto the shelf
  toss: 165, // throw from overhead...
  release: 0.35, // ...the item leaves the hands at this share of the toss
  flight: 250, // ...and lands in the box this long after
  pull: 180, // out of the box to overhead
  press: 400, // closing (or opening) the lid
  light: 450, // crouching at the fuse
  litAt: 0.75, // the fuse catches at this share of the light clip
});
// Gleb 23.10: «только бы побыстрее раза в два», speeds doubled, actions halved.
const RUN_SPEED = 380; // art px per second, empty hands
const CARRY_SPEED = 330;
const HURRY_STEP = 0.25; // extra speed per item the runner is behind
const HURRY_MAX = 1.8;
const ARRIVE_PX = 0.5;
const HOME_SLACK_PX = 6;
const MAX_STEPS_PER_FRAME = 8;

/**
 * @typedef {[number, number]} Point
 * @typedef {{ stand: Point, face: string }} Spot
 * @typedef {{ items: Spot[], drop: Spot, safe: Spot, home: Spot }} BrainScene
 * @typedef {{ place: 'shelf'|'up'|'held'|'down'|'toss'|'pull'|'box', p: number }} ItemState
 */

const freezeItems = (items) => Object.freeze(items.map((it) => Object.freeze({ ...it })));

/**
 * @param {BrainScene} scene
 */
export function createBrain(scene) {
  const n = scene.items.length;
  let s = initial();
  let plan = [];
  let events = [];

  function initial() {
    return {
      x: scene.home.stand[0],
      y: scene.home.stand[1],
      dir: scene.home.face,
      clip: 'idle',
      clipT: 0,
      items: scene.items.map(() => ({ place: 'shelf', p: 0 })),
      held: -1,
      lid: 0,
      fuseT: -1, // ms since the fuse caught, -1 while unlit
    };
  }

  const count = (places) => s.items.filter((it) => places.includes(it.place)).length;
  const setItem = (i, place, p = 0) => {
    s.items = s.items.map((it, k) => (k === i ? { place, p } : it));
  };
  const emit = (type, index = -1) => events.push(Object.freeze({ type, index }));

  // ---------- plan steps ----------

  const go = (spot, opts = {}) => ({ kind: 'go', to: spot.stand, face: spot.face, ...opts });
  const act = (clip, face, ms, onTick, onEnd) => ({ kind: 'act', clip, face, ms, t: 0, onTick, onEnd });

  function fetchPlan(i) {
    const spot = scene.items[i];
    const lift = act(
      'lift',
      spot.face,
      TIMES.lift,
      (u) => setItem(i, 'up', u),
      () => {
        setItem(i, 'held');
        s.held = i;
      },
    );
    return [go(spot), lift, go(scene.drop, { carrying: i, dest: 'box' }), tossStep(i)];
  }

  function tossStep(i) {
    return act('toss', scene.drop.face, TIMES.toss, (u) => {
      if (u >= TIMES.release && s.items[i].place === 'held') {
        setItem(i, 'toss', 0);
        s.held = -1;
      }
    });
  }

  function returnPlan(i) {
    const pull = act(
      'pull',
      scene.drop.face,
      TIMES.pull,
      (u) => setItem(i, 'pull', u),
      () => {
        setItem(i, 'held');
        s.held = i;
        emit('unpacked', i);
      },
    );
    return [go(scene.drop), pull, go(scene.items[i], { carrying: i, dest: 'shelf' }), putStep(i)];
  }

  function putStep(i) {
    return act(
      'put',
      scene.items[i].face,
      TIMES.put,
      (u) => setItem(i, 'down', u),
      () => {
        setItem(i, 'shelf');
        s.held = -1;
      },
    );
  }

  const lidStep = (from, to) =>
    act(
      'press',
      scene.drop.face,
      TIMES.press,
      (u) => {
        s.lid = from + (to - from) * u;
      },
      () => {
        s.lid = to;
        emit(to > 0 ? 'sealed' : 'opened');
      },
    );

  function sealPlan() {
    const light = act('light', scene.drop.face, TIMES.light, (u) => {
      if (u >= TIMES.litAt && s.fuseT < 0) {
        s.fuseT = 0;
        emit('lit');
      }
    });
    return [go(scene.drop), lidStep(0, 1), light, go(scene.safe), act('brace', scene.safe.face, Infinity)];
  }

  // ---------- deciding ----------

  function decide(input) {
    const committed = count(['toss', 'box']);
    if (s.lid > 0 && !(input.seal && committed === n)) return [go(scene.drop), lidStep(s.lid, 0)];
    if (input.seal && count(['box']) === n && s.lid < 1) return sealPlan();
    if (committed < input.target && s.items[committed].place === 'shelf') return fetchPlan(committed);
    if (committed > input.target) {
      const last = committed - 1;
      return s.items[last].place === 'box' ? returnPlan(last) : [];
    }
    const home = scene.home.stand;
    if (Math.hypot(s.x - home[0], s.y - home[1]) > HOME_SLACK_PX) return [go(scene.home)];
    return [];
  }

  // A carried item changes its mind when the scroll does: back to the shelf or on to the box.
  function reroute(step, input) {
    if (step.kind !== 'go' || step.carrying === undefined) return;
    const i = step.carrying;
    const wanted = i < input.target;
    if (step.dest === 'box' && !wanted) plan = [go(scene.items[i], { carrying: i, dest: 'shelf' }), putStep(i)];
    else if (step.dest === 'shelf' && wanted) plan = [go(scene.drop, { carrying: i, dest: 'box' }), tossStep(i)];
  }

  function speed(input) {
    const behind = Math.abs(input.target - count(['toss', 'box']));
    const hurry = Math.min(HURRY_MAX, 1 + HURRY_STEP * Math.max(0, behind - 1));
    return (s.held >= 0 ? CARRY_SPEED : RUN_SPEED) * hurry;
  }

  function setClip(clip) {
    if (s.clip !== clip) s.clipT = 0;
    s.clip = clip;
  }

  function runStep(step, dt, input) {
    if (step.kind === 'go') {
      const dx = step.to[0] - s.x;
      const dy = step.to[1] - s.y;
      const dist = Math.hypot(dx, dy);
      const move = (speed(input) * dt) / 1000;
      setClip(s.held >= 0 ? 'carry' : 'run');
      if (dist <= Math.max(ARRIVE_PX, move)) {
        s.x = step.to[0];
        s.y = step.to[1];
        s.dir = step.face;
        return { done: true, left: move > 0 ? dt * (1 - dist / move) : 0 };
      }
      s.dir = dirOf(dx, dy);
      s.x += (dx / dist) * move;
      s.y += (dy / dist) * move;
      return { done: false, left: 0 };
    }
    setClip(step.clip);
    s.dir = step.face;
    step.t += dt;
    const u = Math.min(1, step.t / step.ms);
    if (step.onTick) step.onTick(u);
    if (u < 1) return { done: false, left: 0 };
    if (step.onEnd) step.onEnd();
    return { done: true, left: step.t - step.ms };
  }

  function advanceFlights(dt) {
    s.items.forEach((it, i) => {
      if (it.place !== 'toss') return;
      const p = it.p + dt / TIMES.flight;
      if (p < 1) {
        setItem(i, 'toss', p);
        return;
      }
      setItem(i, 'box');
      emit('packed', i);
    });
  }

  return {
    /**
     * @param {number} dt ms
     * @param {{ target: number, seal: boolean }} input
     */
    step(dt, input) {
      if (s.fuseT >= 0 && !input.seal) {
        s.fuseT = -1;
        plan = [];
      }
      if (s.fuseT >= 0) s.fuseT += dt;
      advanceFlights(dt);
      s.clipT += dt;
      let left = dt;
      for (let guard = 0; guard < MAX_STEPS_PER_FRAME && left > 0; guard++) {
        if (!plan.length) plan = decide(input);
        if (!plan.length) {
          setClip('idle');
          s.dir = scene.home.face;
          break;
        }
        reroute(plan[0], input);
        const result = runStep(plan[0], left, input);
        if (!result.done) break;
        plan.shift();
        left = result.left;
      }
    },
    /** Everything packed, sealed and lit, as reduced motion shows it. */
    finish() {
      s = {
        ...initial(),
        items: scene.items.map(() => ({ place: 'box', p: 1 })),
        lid: 1,
        x: scene.safe.stand[0],
        y: scene.safe.stand[1],
        dir: scene.safe.face,
      };
      plan = [];
    },
    reset() {
      s = initial();
      plan = [];
      events = [];
    },
    /** Events since the last call: packed, unpacked, sealed, opened, lit. */
    drain() {
      const out = events;
      events = [];
      return out;
    },
    view() {
      return Object.freeze({ ...s, items: freezeItems(s.items) });
    },
  };
}
