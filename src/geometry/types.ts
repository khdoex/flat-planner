import type { Expr } from './expr';

export type V2 = [number, number];
// Where a measurement came from, from weakest to strongest evidence: assumed, sketch, photo, guess, uncertain, tape.
export type Status = 'tape' | 'uncertain' | 'guess' | 'photo' | 'sketch' | 'assumed';

export interface Dim { v: number; status: Status; room: string; label: string; note?: string }

export interface WallDef { id: string; name: string; from: [Expr, Expr]; open?: boolean }
export interface RoomDef { id: string; name: string; floor: string; origin: [Expr, Expr]; note?: string; walls: WallDef[] }
export interface OpeningDef {
  id: string; kind: 'window' | 'door'; name?: string; room: string; wall: string; from: Expr; width: Expr;
  y0?: Expr; y1: Expr; mullions?: number; hinge?: 'start' | 'end'; swing?: 'in' | 'out'; guess?: string;
}
export interface FixtureDef {
  id: string; kind: string; room: string; name: string; rect?: [Expr, Expr, Expr, Expr]; poly?: [Expr, Expr][];
  y0?: Expr; h: Expr; mat?: string; label?: boolean; guess?: string;
}
export interface CheckDef { label: string; room: string; a: Expr; b: Expr; tol?: number }

export interface FlatFile {
  units: 'cm'; frame?: string; status?: Record<string, string>;
  dims: Record<string, Dim>; derived: Record<string, string>;
  rooms: RoomDef[]; openings: OpeningDef[]; fixtures: FixtureDef[]; checks: CheckDef[];
}

export interface Wall { room: string; id: string; name: string; a: V2; b: V2; open: boolean; n: V2; len: number }
export interface Room { id: string; name: string; floor: string; note?: string; origin: V2; poly: V2[]; walls: Wall[]; area: number }
export interface Opening {
  id: string; kind: 'window' | 'door'; name?: string; room: string; wall: Wall; a: V2; b: V2; y0: number; y1: number;
  width: number; mullions: number; hinge: 'start' | 'end'; swing: 'in' | 'out'; guess?: string;
}
export interface Fixture { id: string; kind: string; room: string; name: string; poly: V2[]; y0: number; h: number; mat: string; label: boolean; guess?: string }
export interface CheckResult { label: string; room: string; a: number; b: number; ok: boolean }

export interface Flat {
  values: Record<string, number>; T: number; H: number;
  rooms: Room[]; openings: Opening[]; fixtures: Fixture[]; checks: CheckResult[]; errors: string[];
}

export interface Item {
  id: string; kind: string; name: string; room: string;
  x: number; z: number; rotation: number; w: number; d: number; h: number;
  y?: number; color: string; style?: string; panels?: boolean;
}
export interface LayoutFile { name?: string; note?: string; items: Item[] }
