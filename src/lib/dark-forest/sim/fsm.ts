/**
 * A tiny finite-state-machine kit shared by every entity in the sim.
 *
 * An entity owns its runtime machine (`fsm`: current state + time in state).
 * Behaviour lives in a `MachineDef`: one `StateDef` per state, each with
 * optional enter / update / exit hooks and event handlers. `update` and event
 * handlers return the next state (or nothing to stay put), so every transition
 * goes through `transition`, which runs exit/enter in order.
 *
 * Entities talk to each other through events (see `SimEvents`), never by
 * flipping each other's state directly. A new entity just needs a def and an
 * entry in the agent registry; new interactions are new events + handlers.
 */

export interface Fsm<S extends string> {
  state: S
  /** Seconds spent in the current state. */
  time: number
  prev: S | null
}

export const fsm = <S extends string>(initial: S): Fsm<S> => ({ state: initial, time: 0, prev: null })

type Next<S extends string> = S | void

export type EventHandlers<E, C, S extends string, Ev> = {
  [K in keyof Ev]?: (e: E, ctx: C, payload: Ev[K]) => Next<S>
}

export interface StateDef<E, C, S extends string, Ev> {
  enter?: (e: E, ctx: C) => void
  update?: (e: E, ctx: C, dt: number) => Next<S>
  exit?: (e: E, ctx: C) => void
  on?: EventHandlers<E, C, S, Ev>
}

export interface MachineDef<E extends { fsm: Fsm<S> }, C, S extends string, Ev> {
  name: string
  states: { [K in S]: StateDef<E, C, S, Ev> }
  /** Runs every tick before the state's own update: needs, timers, sensing. */
  always?: (e: E, ctx: C, dt: number) => Next<S>
  /** Event handlers that apply in any state. A state's own handler wins. */
  on?: EventHandlers<E, C, S, Ev>
}

export function transition<E extends { fsm: Fsm<S> }, C, S extends string, Ev>(def: MachineDef<E, C, S, Ev>, e: E, ctx: C, to: S) {
  const from = e.fsm.state
  def.states[from].exit?.(e, ctx)
  e.fsm.prev = from
  e.fsm.state = to
  e.fsm.time = 0
  def.states[to].enter?.(e, ctx)
}

export function tick<E extends { fsm: Fsm<S> }, C, S extends string, Ev>(def: MachineDef<E, C, S, Ev>, e: E, ctx: C, dt: number) {
  e.fsm.time += dt
  const forced = def.always?.(e, ctx, dt)
  if (forced && forced !== e.fsm.state) return transition(def, e, ctx, forced)
  const next = def.states[e.fsm.state].update?.(e, ctx, dt)
  if (next && next !== e.fsm.state) transition(def, e, ctx, next)
}

export function send<E extends { fsm: Fsm<S> }, C, S extends string, Ev, K extends keyof Ev>(
  def: MachineDef<E, C, S, Ev>,
  e: E,
  ctx: C,
  type: K,
  payload: Ev[K],
) {
  const handler = def.states[e.fsm.state].on?.[type] ?? def.on?.[type]
  const next = handler?.(e, ctx, payload)
  if (next && next !== e.fsm.state) transition(def, e, ctx, next)
}
