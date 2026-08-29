import { describe, expect, it } from "vitest";
import {
  WAVE_SPEED_HZ,
  WAVE_WAVELENGTH_COLUMNS,
  columnJitter,
  arrivalOrder,
  twinkleAt,
  waveAt,
  waveValueAt,
  type WaveShape,
} from "./wave";

/** The wave as it ships: no treatments on. */
const PLAIN: WaveShape = {
  front: true,
  diagonal: false,
  sharpFront: false,
  twinkle: false,
  twinkleShare: 0.3,
};

describe("columnJitter", () => {
  it("is stable for a given column", () => {
    expect(columnJitter(17)).toBe(columnJitter(17));
  });

  it("differs between columns", () => {
    expect(columnJitter(3)).not.toBe(columnJitter(4));
  });

  it("stays within -1..1", () => {
    for (let i = 0; i < 60; i++) {
      expect(Math.abs(columnJitter(i))).toBeLessThanOrEqual(1);
    }
  });
});

describe("waveAt", () => {
  it("stays within 0..1 for any column and time", () => {
    for (let column = 0; column < 53; column++) {
      for (let t = 0; t < 4; t += 0.1) {
        const value = waveAt(column, 0, t, PLAIN);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("travels: a column's value changes over time", () => {
    const samples = [0, 0.25, 0.5, 0.75].map((t) => waveAt(10, 0, t, PLAIN));
    expect(new Set(samples).size).toBeGreaterThan(1);
  });

  it("offsets neighbouring columns, so it reads as a front", () => {
    expect(waveAt(0, 0, 0, PLAIN, 0)).not.toBeCloseTo(waveAt(4, 0, 0, PLAIN, 0), 2);
  });

  it("repeats every wavelength when jitter is off", () => {
    // Without the per-column jitter the wave is a pure sine, so columns a
    // full wavelength apart sit at the same point in the cycle.
    expect(waveAt(0, 0, 0, PLAIN, 0)).toBeCloseTo(waveAt(WAVE_WAVELENGTH_COLUMNS, 0, 0, PLAIN, 0), 5);
  });

  it("is deterministic for the same inputs", () => {
    expect(waveAt(7, 0, 1.5, PLAIN)).toBe(waveAt(7, 0, 1.5, PLAIN));
  });

  it("adds variation that a pure sine would not have", () => {
    const pure = waveAt(5, 0, 0.3, PLAIN, 0);
    const jittered = waveAt(5, 0, 0.3, PLAIN);
    expect(jittered).not.toBe(pure);
  });
});

describe("waveAt as a triangle", () => {
  // The value is quantized into five colour bands, so what matters is
  // that it spends a fair share of each cycle in every one. A sine
  // lingers near its extremes and would park ~60% of the time on cream
  // or the darkest green.
  it("spends roughly equal time in each fifth of its range", () => {
    const buckets = [0, 0, 0, 0, 0];
    const samples = 2000;

    for (let i = 0; i < samples; i++) {
      // One full cycle, jitter off so this measures the curve alone.
      const t = (i / samples) / WAVE_SPEED_HZ;
      const value = waveAt(0, 0, t, PLAIN, 0);
      buckets[Math.min(4, Math.floor(value * 5))] += 1;
    }

    for (const count of buckets) {
      expect(count / samples).toBeGreaterThan(0.15);
      expect(count / samples).toBeLessThan(0.25);
    }
  });

  it("reaches both ends of the range within a cycle", () => {
    let lowest = 1;
    let highest = 0;
    for (let i = 0; i < 500; i++) {
      const value = waveAt(0, 0, (i / 500) / WAVE_SPEED_HZ, PLAIN, 0);
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
    }
    expect(lowest).toBeLessThan(0.02);
    expect(highest).toBeGreaterThan(0.98);
  });
});

describe("wave treatments", () => {
  const DIAGONAL: WaveShape = { ...PLAIN, diagonal: true };
  const SHARP: WaveShape = { ...PLAIN, sharpFront: true };

  it("leaves a column uniform until the diagonal is on", () => {
    // Sunday and Saturday of the same week, jitter off so the only
    // difference can be the weekday term.
    expect(waveAt(4, 0, 0.4, PLAIN, 0)).toBe(waveAt(4, 6, 0.4, PLAIN, 0));
    expect(waveAt(4, 0, 0.4, DIAGONAL, 0)).not.toBe(
      waveAt(4, 6, 0.4, DIAGONAL, 0),
    );
  });

  it("rises faster than it falls once the front is sharp", () => {
    const at = (t: number) => waveAt(0, 0, t / WAVE_SPEED_HZ, SHARP, 0);
    // A cycle's peak sits near the end of the rise, not at its middle.
    let peakAt = 0;
    for (let i = 1; i < 1000; i++) {
      if (at(i / 1000) > at(peakAt)) peakAt = i / 1000;
    }
    expect(peakAt).toBeLessThan(0.3);

    // Symmetric by contrast: the triangle peaks halfway.
    let plainPeak = 0;
    for (let i = 1; i < 1000; i++) {
      const t = i / 1000;
      if (waveAt(0, 0, t / WAVE_SPEED_HZ, PLAIN, 0) >
          waveAt(0, 0, plainPeak / WAVE_SPEED_HZ, PLAIN, 0)) {
        plainPeak = t;
      }
    }
    expect(plainPeak).toBeGreaterThan(0.4);
    expect(plainPeak).toBeLessThan(0.6);
  });

  it("stays in range with every treatment on", () => {
    const all: WaveShape = { ...PLAIN, diagonal: true, sharpFront: true, twinkle: true };
    for (let column = 0; column < 53; column++) {
      for (let weekday = 0; weekday < 7; weekday++) {
        for (let i = 0; i < 20; i++) {
          const value = waveValueAt(column, weekday, i / 7, all);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("twinkleAt", () => {
  const CELLS: [number, number][] = [];
  for (let column = 0; column < 53; column++) {
    for (let weekday = 0; weekday < 7; weekday++) CELLS.push([column, weekday]);
  }

  it("picks roughly the share it is asked for", () => {
    for (const asked of [0.3, 0.6]) {
      // A cell is in the set if it ever leaves zero.
      const members = CELLS.filter(([c, d]) =>
        Array.from({ length: 40 }, (_, i) => twinkleAt(c, d, i / 8, asked)).some(
          (v) => v > 0,
        ),
      );
      const share = members.length / CELLS.length;
      expect(share).toBeGreaterThan(asked - 0.08);
      expect(share).toBeLessThan(asked + 0.08);
    }
  });

  it("keeps the same cells across time, rather than churning", () => {
    const memberAt = (t: number) =>
      CELLS.filter(([c, d]) => twinkleAt(c, d, t, 0.3) > 0).length;
    // Counts differ frame to frame only because members pass through
    // zero, so compare set membership over a window instead.
    const inSet = (t0: number) =>
      new Set(
        CELLS.filter(([c, d]) =>
          Array.from({ length: 30 }, (_, i) => twinkleAt(c, d, t0 + i / 8, 0.3)).some(
            (v) => v > 0,
          ),
        ).map(([c, d]) => `${c}:${d}`),
      );
    expect([...inSet(0)]).toEqual([...inSet(11)]);
    expect(memberAt(0)).toBeGreaterThan(0);
  });

  it("does not share a beat across the set", () => {
    // Two members peaking together across a long window would mean one
    // rhythm rather than many.
    const members = CELLS.filter(([c, d]) => twinkleAt(c, d, 0.37, 0.3) > 0).slice(
      0,
      12,
    );
    const values = members.map(([c, d]) => twinkleAt(c, d, 0.37, 0.3));
    expect(new Set(values.map((v) => v.toFixed(3))).size).toBeGreaterThan(6);
  });

  it("stays silent for cells outside the set at every time", () => {
    const outside = CELLS.find(
      ([c, d]) =>
        !Array.from({ length: 40 }, (_, i) => twinkleAt(c, d, i / 8, 0.3)).some(
          (v) => v > 0,
        ),
    );
    expect(outside).toBeDefined();
  });
});

describe("waveValueAt", () => {
  const FRONT_OFF: WaveShape = { ...PLAIN, front: false };

  it("is silent with the front off and nothing else on", () => {
    for (let column = 0; column < 53; column++) {
      expect(waveValueAt(column, 3, 0.6, FRONT_OFF)).toBe(0);
    }
  });

  it("runs the pulses alone when the front is off", () => {
    const twinkleOnly: WaveShape = { ...FRONT_OFF, twinkle: true };
    const lit = Array.from({ length: 53 }, (_, c) =>
      waveValueAt(c, 3, 0.6, twinkleOnly),
    ).filter((v) => v > 0);
    expect(lit.length).toBeGreaterThan(0);
    expect(lit.length).toBeLessThan(53);
  });

  it("never lets a pulse pull a lit cell back down", () => {
    const both: WaveShape = { ...PLAIN, twinkle: true };
    for (let column = 0; column < 53; column++) {
      for (const t of [0.2, 0.9, 1.7]) {
        expect(waveValueAt(column, 2, t, both)).toBeGreaterThanOrEqual(
          waveAt(column, 2, t, PLAIN),
        );
      }
    }
  });
});

describe("twinkle share", () => {
  const CELLS: [number, number][] = [];
  for (let column = 0; column < 53; column++) {
    for (let weekday = 0; weekday < 7; weekday++) CELLS.push([column, weekday]);
  }

  const setFor = (share: number) =>
    new Set(
      CELLS.filter(([c, d]) =>
        Array.from({ length: 40 }, (_, i) =>
          twinkleAt(c, d, i / 8, share),
        ).some((v) => v > 0),
      ).map(([c, d]) => `${c}:${d}`),
    );

  it("grows and shrinks with the share", () => {
    expect(setFor(0).size).toBe(0);
    expect(setFor(0.1).size).toBeLessThan(setFor(0.5).size);
    expect(setFor(1).size).toBe(CELLS.length);
  });

  it("adds cells rather than reshuffling which ones pulse", () => {
    // Raising the share should keep every cell that was already in.
    const small = setFor(0.2);
    const large = setFor(0.6);
    for (const cell of small) expect(large.has(cell)).toBe(true);
  });
});

describe("arrivalOrder", () => {
  it("is stable per cell", () => {
    expect(arrivalOrder(9, 4)).toBe(arrivalOrder(9, 4));
  });

  it("spreads across the range rather than clustering", () => {
    const buckets = [0, 0, 0, 0];
    for (let column = 0; column < 53; column++) {
      for (let weekday = 0; weekday < 7; weekday++) {
        buckets[Math.min(3, Math.floor(arrivalOrder(column, weekday) * 4))] += 1;
      }
    }
    // Every quarter of the window gets a real share of the cells, so the
    // arrival is scattered over it rather than bunched at one moment.
    for (const count of buckets) expect(count).toBeGreaterThan(371 / 8);
  });

  it("does not order cells by column, which would read as a sweep", () => {
    // Neighbouring columns must not arrive in step.
    const first = Array.from({ length: 20 }, (_, c) => arrivalOrder(c, 3));
    const ascending = first.every((v, i) => i === 0 || v >= first[i - 1]);
    expect(ascending).toBe(false);
  });
});
