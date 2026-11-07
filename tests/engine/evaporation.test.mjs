// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// evaporation() and diffusivity_h2o_air(): free-surface evaporation by the heat and mass transfer analogy (Incropera), with the
// film-theory blowing correction; checked piece by piece against independent calculations.
import { run, err, units, CP } from '../lib/engine.mjs';
import { ok, near, done } from '../lib/check.mjs';

const ev = (args) => run(`x_ = evaporation(${args})`).st.x_;
ok('D_AB = 0.26e-4 m^2/s at 298 K and 1 atm (Incropera Table A.8), as T^(3/2)/P', near(run('x = diffusivity_h2o_air(298, 101325)').st.x, 0.26e-4, 1e-12) && near(run('x = diffusivity_h2o_air(350, 2*101325)').st.x, 0.26e-4 * (350 / 298) ** 1.5 / 2, 1e-12));
ok('saturated air at the water temperature: no evaporation', Math.abs(ev("'m', 300, 300, 1, 101325, 0.1")) < 1e-12);
ok('drier air evaporates more; warmer water evaporates more', ev("'m', 300, 300, 0.3, 101325, 0.1") > ev("'m', 300, 300, 0.6, 101325, 0.1") && ev("'m', 320, 300, 0.5, 101325, 0.1") > ev("'m', 310, 300, 0.5, 101325, 0.1"));

// free convection: Ra from the density difference, here recomputed with CoolProp's humid air (HAPropsSI), and Sh = 0.54 Ra^(1/4)
{
  const Ts = 343.15, Ti = 295.15, phi = 0.5, P = 101325, L = 0.02, args = `${Ts}, ${Ti}, ${phi}, ${P}, ${L}`;
  const rhoHA = (T, R) => (1 + CP.HAPropsSI('W', 'T', T, 'P', P, 'R', R)) / CP.HAPropsSI('Vda', 'T', T, 'P', P, 'R', R);
  const rs = rhoHA(Ts, 1), ri = rhoHA(Ti, phi), Tf = (Ts + Ti) / 2, nu = CP.PropsSI('V', 'T', Tf, 'P', P, 'Air') / CP.PropsSI('D', 'T', Tf, 'P', P, 'Air');
  const D = 0.26e-4 * (Tf / 298) ** 1.5, Ra = 9.80665 * ((ri - rs) / ((ri + rs) / 2)) * L ** 3 / (nu * D);
  ok('tea cup: Ra of the density difference agrees with CoolProp humid air within 1 %', near(ev(`'Ra', ${args}`), Ra, 1e-2), [ev(`'Ra', ${args}`), Ra]);
  ok('tea cup: Sh = 0.54 Ra^(1/4) (Eq. 9.30, warm moist air rising) and h_m = Sh D/L', near(ev(`'Sh', ${args}`), 0.54 * ev(`'Ra', ${args}`) ** 0.25, 1e-12) && near(ev(`'h_m', ${args}`), ev(`'Sh', ${args}`) * ev(`'D', ${args}`) / L, 1e-12));
  const hfg = CP.PropsSI('H', 'T', Ts, 'Q', 1, 'Water') - CP.PropsSI('H', 'T', Ts, 'Q', 0, 'Water');
  ok('q = m h_fg(T_s)', near(ev(`'q', ${args}`), ev(`'m', ${args}`) * hfg, 1e-12));
}
// the blowing correction vanishes at low rates: cold water, m -> h_m rho (w_s - w_inf)
{
  const Ts = 283.15, Ti = 283.15, phi = 0.2, P = 101325, args = `${Ts}, ${Ti}, ${phi}, ${P}, 1, 1`;
  const R = 8.314462618, Mw = 0.018015268, Ma = 0.02896546, pvs = CP.PropsSI('P', 'T', Ts, 'Q', 0, 'Water'), pvi = phi * pvs;
  const rho = (pv, T) => (P - pv) * Ma / (R * T) + pv * Mw / (R * T), rs = rho(pvs, Ts), ri = rho(pvi, Ti);
  const low = ev(`'h_m', ${args}`) * (rs + ri) / 2 * (pvs * Mw / (R * Ts) / rs - pvi * Mw / (R * Ti) / ri);
  ok('cold water: the rate is the low-rate form within 1 % (the film correction is small)', near(ev(`'m', ${args}`), low, 1e-2) && ev(`'m', ${args}`) > low, [ev(`'m', ${args}`), low]);
}
// forced flow: laminar Sh = 0.664 Re^(1/2) Sc^(1/3); Sh/Nu = (Sc/Pr)^(1/3); turbulent mixed above Re = 5e5
{
  const a = "301.15, 303.15, 0.6, 101325, 0.5, 2", b = "301.15, 303.15, 0.6, 101325, 10, 2";
  const Re = ev(`'Re', ${a}`), Sh = ev(`'Sh', ${a}`), Nu = ev(`'Nu', ${a}`);
  ok('pool, short fetch: laminar, Sh = 0.664 Re^(1/2) Sc^(1/3) (Eq. 7.31 by analogy)', Re < 5e5 && near(Sh / Nu, (CP.PropsSI('V', 'T', 302.15, 'P', 101325, 'Air') / CP.PropsSI('D', 'T', 302.15, 'P', 101325, 'Air') / ev(`'D', ${a}`) / (CP.PropsSI('Prandtl', 'T', 302.15, 'P', 101325, 'Air'))) ** (1 / 3), 1e-3));
  ok('pool, 10 m fetch at 2 m/s: Re > 5e5, mixed boundary layer (Eq. 7.38), and more evaporation per m^2 than laminar would give', ev(`'Re', ${b}`) > 5e5 && ev(`'Sh', ${b}`) > 0.664 * ev(`'Re', ${b}`) ** 0.5 * 0.6 ** (1 / 3));
}
ok('cold water under warm dry air (stable layer): Sh = 0.27 Ra^(1/4) (Eq. 9.32)', (() => { const a = "280, 300, 0.1, 101325, 0.5"; return near(ev(`'Sh', ${a}`), 0.27 * ev(`'Ra', ${a}`) ** 0.25, 1e-12); })());
ok('messages: boiling, the humidity, the output', /near boiling/.test(err("x = evaporation('m', 372, 300, 0.5, 101325, 0.1)") || '') && /relative humidity of the air, 0 to 1/.test(err("x = evaporation('m', 330, 300, 50, 101325, 0.1)") || '') && /should be one of 'm'/.test(err("x = evaporation('rate', 330, 300, 0.5, 101325, 0.1)") || ''));
const u = units(`T_s = 70 [degC]\nT_inf = 22 [degC]\nP = 1 [atm]\nL = 2 [cm]\nm = evaporation('m', T_s, T_inf, 0.5, P, L)\nq = evaporation('q', T_s, T_inf, 0.5, P, L)`);
ok('Check Units: m in kg/(m^2 s), q in W/m^2', u.issues.length === 0 && /^kg ?\/ ?\(m\^2 s\)$/.test(u.p.variables.get("m").inferredUnit) && u.p.variables.get('q').inferredUnit === 'W/m^2', [u.issues, u.p.variables.get('m').inferredUnit, u.p.variables.get('q').inferredUnit]);
done();
