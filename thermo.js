// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Property functions: ideal-gas (NASA polynomial) data, physical constants, and the CoolProp front end (ThermoEngine).
// ==========================================
// 2b. PHYSICAL CONSTANTS AND IDEAL-GAS (COMBUSTION) DATA
// ==========================================
// Ideal-gas species: NASA 7-coefficient polynomials (McBride, Gordon, Reno, NASA TM-4513, 1993), as distributed with Cantera.
// Standard state 1 bar. h and s are absolute (h includes the enthalpy of formation, referenced to the elements at 298.15 K).
// Fields: M = molar mass in kg/mol, T = temperature breakpoints (K), a = coefficients for each range, d = description.
// Function table entries for the ideal-gas and constant functions (merged into ThermoEngine.FUNCS with ...IG_FUNCS)
const IG_FUNCS = {
    ig_enthalpy: { key: '', unit: 'J/mol', kind: 'ig', argUnits: ['K'], desc: "Absolute molar enthalpy of an ideal gas (includes the enthalpy of formation): ig_enthalpy('CO2', T)" },
    ig_internalenergy: { key: '', unit: 'J/mol', kind: 'ig', argUnits: ['K'], desc: "Absolute molar internal energy of an ideal gas: ig_internalenergy('CO2', T)" },
    ig_entropy: { key: '', unit: 'J/(mol K)', kind: 'ig', argUnits: ['K', 'Pa'], desc: "Absolute molar entropy of an ideal gas at 1 bar, or at pressure P: ig_entropy('CO2', T) or ig_entropy('CO2', T, P)" },
    ig_gibbs: { key: '', unit: 'J/mol', kind: 'ig', argUnits: ['K', 'Pa'], desc: "Molar Gibbs energy h - T s of an ideal gas at 1 bar, or at pressure P: ig_gibbs('CO2', T) or ig_gibbs('CO2', T, P)" },
    ig_cp: { key: '', unit: 'J/(mol K)', kind: 'ig', argUnits: ['K'], desc: "Molar heat capacity at constant pressure of an ideal gas: ig_cp('CO2', T)" },
    ig_formationenthalpy: { key: '', unit: 'J/mol', kind: 'ig', argUnits: [], desc: "Enthalpy of formation at 298.15 K: ig_formationenthalpy('CO2')" },
    ig_exergy: { key: '', unit: 'J/mol', kind: 'ig', argUnits: ['K', 'Pa', 'K', 'Pa'], desc: "Physical flow exergy of an ideal gas, h - h0 - T0 (s - s0), dead state T0, P0: ig_exergy('CO2', T, P, T0, P0)" },
    ig_chemicalexergy: { key: '', unit: 'J/mol', kind: 'ig', argUnits: ['K', 'Pa'], desc: "Chemical exergy of a species of C, H, O and N, from its reaction with the reference atmosphere: ig_chemicalexergy('CH4') (298.15 K, 1 atm) or ig_chemicalexergy('CH4', T0, P0), optionally followed by mole fractions that differ from the default atmosphere, such as 'CO2', 0.0004" },
    ig_mixingexergy: { key: '', unit: 'J/mol', kind: 'igmix', argUnits: ['', '', 'K'], desc: "Exergy of an ideal-gas component at mole fraction y relative to y0 in the environment, R T0 ln(y/y0): ig_mixingexergy(y, y0, T0)" },
    ig_molarmass: { key: '', unit: 'kg/mol', kind: 'ig', argUnits: [], desc: "Molar mass of an ideal-gas species, in kg per mol: ig_molarmass('CO2')" },
    constant: { key: '', unit: '', kind: 'phys', desc: "Physical constant by name, in SI: constant('sigma'), constant('gravity'), ..." }
};

const IDEAL_GAS_DB = {
    'N2': {
        nasa: 'N2', M: 0.028014, T: [200, 1000, 6000], d: 'nitrogen',
        a: [[3.53100528, -0.000123660987, -5.02999437e-07, 2.43530612e-09, -1.40881235e-12, -1046.97628, 2.96747468], [2.95257626, 0.00139690057, -4.92631691e-07, 7.86010367e-11, -4.60755321e-15, -923.948645, 5.87189252]]
    },
    'O2': {
        nasa: 'O2', M: 0.031998, T: [200, 1000, 6000], d: 'oxygen',
        a: [[3.78245636, -0.00299673415, 9.847302e-06, -9.68129508e-09, 3.24372836e-12, -1063.94356, 3.65767573], [3.66096083, 0.000656365523, -1.41149485e-07, 2.05797658e-11, -1.29913248e-15, -1215.97725, 3.41536184]]
    },
    'H2': {
        nasa: 'H2', M: 0.002016, T: [200, 1000, 6000], d: 'hydrogen',
        a: [[2.34433112, 0.00798052075, -1.9478151e-05, 2.01572094e-08, -7.37611761e-12, -917.935173, 0.683010238], [2.93286579, 0.000826607967, -1.46402335e-07, 1.54100359e-11, -6.88804432e-16, -813.065597, -1.02432887]]
    },
    'H2O': {
        nasa: 'H2O', M: 0.018015, T: [200, 1000, 6000], d: 'water vapor',
        a: [[4.19864056, -0.0020364341, 6.52040211e-06, -5.48797062e-09, 1.77197817e-12, -30293.7267, -0.849032208], [2.67703787, 0.00297318329, -7.7376969e-07, 9.44336689e-11, -4.26900959e-15, -29885.8938, 6.88255571]]
    },
    'CO': {
        nasa: 'CO', M: 0.02801, T: [200, 1000, 6000], d: 'carbon monoxide',
        a: [[3.57953347, -0.00061035368, 1.01681433e-06, 9.07005884e-10, -9.04424499e-13, -14344.086, 3.50840928], [3.04848583, 0.00135172818, -4.85794075e-07, 7.88536486e-11, -4.69807489e-15, -14266.1171, 6.0170979]]
    },
    'CO2': {
        nasa: 'CO2', M: 0.044009, T: [200, 1000, 6000], d: 'carbon dioxide',
        a: [[2.35677352, 0.00898459677, -7.12356269e-06, 2.45919022e-09, -1.43699548e-13, -48371.9697, 9.90105222], [4.63659493, 0.00274131991, -9.95828531e-07, 1.60373011e-10, -9.16103468e-15, -49024.9341, -1.93534855]]
    },
    'Ar': {
        nasa: 'Ar', M: 0.039948, T: [200, 6000], d: 'argon',
        a: [[2.5, 0, 0, 0, 0, -745.375, 4.37967491]]
    },
    'He': {
        nasa: 'He', M: 0.0040026, T: [200, 6000], d: 'helium',
        a: [[2.5, 0, 0, 0, 0, -745.375, 0.928724724]]
    },
    'N': {
        nasa: 'N', M: 0.014007, T: [200, 1000, 6000], d: 'atomic nitrogen',
        a: [[2.5, 0, 0, 0, 0, 56104.6378, 4.19390932], [2.41594293, 0.0001748906, -1.19023667e-07, 3.02262387e-11, -2.0360979e-15, 56133.7748, 4.64960986]]
    },
    'O': {
        nasa: 'O', M: 0.015999, T: [200, 1000, 6000], d: 'atomic oxygen',
        a: [[3.1682671, -0.00327931884, 6.64306396e-06, -6.12806624e-09, 2.11265971e-12, 29122.2592, 2.05193346], [2.54363697, -2.73162486e-05, -4.1902952e-09, 4.95481845e-12, -4.79553694e-16, 29226.012, 4.92229457]]
    },
    'H': {
        nasa: 'H', M: 0.001008, T: [200, 1000, 6000], d: 'atomic hydrogen',
        a: [[2.5, 0, 0, 0, 0, 25473.6599, -0.446682853], [2.50000286, -5.65334214e-09, 3.63251723e-12, -9.1994972e-16, 7.95260746e-20, 25473.6589, -0.446698494]]
    },
    'OH': {
        nasa: 'OH', M: 0.017007, T: [200, 1000, 6000], d: 'hydroxyl',
        a: [[3.99201543, -0.00240131752, 4.61793841e-06, -3.88113333e-09, 1.3641147e-12, 3615.08056, -0.103925458], [2.83864607, 0.00110725586, -2.93914978e-07, 4.20524247e-11, -2.42169092e-15, 3943.95852, 5.84452662]]
    },
    'NO': {
        nasa: 'NO', M: 0.030006, T: [200, 1000, 6000], d: 'nitric oxide',
        a: [[4.21859896, -0.00463988124, 1.10443049e-05, -9.34055507e-09, 2.80554874e-12, 9845.09964, 2.28061001], [3.26071234, 0.00119101135, -4.29122646e-07, 6.94481463e-11, -4.03295681e-15, 9921.43132, 6.36900518]]
    },
    'NO2': {
        nasa: 'NO2', M: 0.046005, T: [200, 1000, 6000], d: 'nitrogen dioxide',
        a: [[3.94403907, -0.00158547444, 1.66578984e-05, -2.04754478e-08, 7.83503265e-12, 2896.59865, 6.31196225], [4.88474429, 0.00217241639, -8.2807902e-07, 1.57477293e-10, -1.05110549e-14, 2316.48462, -0.117357075]]
    },
    'N2O': {
        nasa: 'N2O', M: 0.044013, T: [200, 1000, 6000], d: 'nitrous oxide',
        a: [[2.2571686, 0.0113046338, -1.3671035e-05, 9.68162098e-09, -2.93055583e-12, 8741.77146, 10.7579154], [4.82318873, 0.00262685279, -9.58426058e-07, 1.59991296e-10, -9.77416939e-15, 8073.35662, -2.202366]]
    },
    'NH3': {
        nasa: 'NH3', M: 0.017031, T: [200, 1000, 6000], d: 'ammonia',
        a: [[4.30177808, -0.0047712733, 2.19341619e-05, -2.29856489e-08, 8.28992268e-12, -6748.06394, -0.690644393], [2.71709692, 0.00556856338, -1.76886396e-06, 2.6741726e-10, -1.52731419e-14, -6584.51989, 6.09289837]]
    },
    'HO2': {
        nasa: 'HO2', M: 0.033006, T: [200, 1000, 6000], d: 'hydroperoxyl',
        a: [[4.30179801, -0.00474912051, 2.11582891e-05, -2.42763894e-08, 9.29225124e-12, 294.80804, 3.71666245], [4.17228728, 0.00188117647, -3.46277408e-07, 1.94657853e-11, 1.76254294e-16, 61.8102964, 2.95767746]]
    },
    'H2O2': {
        nasa: 'H2O2', M: 0.034014, T: [200, 1000, 6000], d: 'hydrogen peroxide',
        a: [[4.27611269, -0.000542822417, 1.67335701e-05, -2.15770813e-08, 8.62454363e-12, -17754.2989, 3.43505074], [4.57333537, 0.0040498407, -1.29479479e-06, 1.9728171e-10, -1.13402846e-14, -18054.8121, 0.704278488]]
    },
    'O3': {
        nasa: 'O3', M: 0.047997, T: [200, 1000, 6000], d: 'ozone',
        a: [[3.40738221, 0.00205379063, 1.38486052e-05, -2.23311542e-08, 9.76073226e-12, 15864.4979, 8.2824758], [12.3302914, -0.0119324783, 7.98741278e-06, -1.77194552e-09, 1.26075824e-13, 12675.5831, -40.8823374]]
    },
    'HCN': {
        nasa: 'HCN', M: 0.027026, T: [200, 1000, 6000], d: 'hydrogen cyanide',
        a: [[2.25901123, 0.0100510591, -1.33514911e-05, 1.00920882e-08, -3.00882048e-12, 15215.8495, 8.9163459], [3.80231733, 0.00314630009, -1.06315698e-06, 1.66185395e-10, -9.79891789e-15, 14910.4829, 1.57503584]]
    },
    'S': {
        nasa: 'S', M: 0.03206, T: [200, 1000, 6000], d: 'atomic sulfur',
        a: [[2.31725616, 0.00478018342, -1.42082674e-05, 1.56569538e-08, -5.96588299e-12, 32506.8976, 6.06242434], [2.87936498, -0.000511050388, 2.53806719e-07, -4.45455458e-11, 2.66717362e-15, 32501.3791, 3.98140647]]
    },
    'SO2': {
        nasa: 'SO2', M: 0.064058, T: [300, 1000, 5000], d: 'sulfur dioxide',
        a: [[3.2665338, 0.0053237902, 6.8437552e-07, -5.2810047e-09, 2.5590454e-12, -36908.148, 9.66465108], [5.2451364, 0.0019704204, -8.0375769e-07, 1.5149969e-10, -1.0558004e-14, -37558.227, -1.07404892]]
    },
    'SO3': {
        nasa: 'SO3', M: 0.080057, T: [300, 1000, 5000], d: 'sulfur trioxide',
        a: [[2.5780385, 0.014556335, -9.1764173e-06, -7.9203022e-10, 1.9709473e-12, -48931.753, 12.2651384], [7.0757376, 0.0031763387, -1.353576e-06, 2.5630912e-10, -1.7936044e-14, -50211.376, -11.1875176]]
    },
    'H2S': {
        nasa: 'H2S', M: 0.034076, T: [300, 1000, 5000], d: 'hydrogen sulfide',
        a: [[3.9323476, -0.00050260905, 4.5928473e-06, -3.1807214e-09, 6.6497561e-13, -3650.5359, 2.3157905], [2.7452199, 0.0040434607, -1.538451e-06, 2.7520249e-10, -1.8592095e-14, -3419.9444, 8.0546745]]
    },
    'COS': {
        nasa: 'COS', M: 0.06007, T: [300, 1000, 5000], d: 'carbonyl sulfide',
        a: [[2.4625321, 0.011947992, -1.379437e-05, 8.0707736e-09, -1.8327653e-12, -17803.987, 10.8058688], [5.2392, 0.0024100584, -9.6064522e-07, 1.7778347e-10, -1.2235704e-14, -18480.455, -3.07773889]]
    },
    'Cl2': {
        nasa: 'CL2', M: 0.0709, T: [200, 1000, 6000], d: 'chlorine',
        a: [[2.73638114, 0.007835257, -1.45104963e-05, 1.25730834e-08, -4.13247145e-12, -1058.80114, 9.44555879], [4.74727508, -0.00048858171, 2.68444871e-07, -2.43476083e-11, -1.03683148e-15, -1511.01862, -0.344551305]]
    },
    'HCl': {
        nasa: 'HCL', M: 0.036458, T: [300, 1000, 5000], d: 'hydrogen chloride',
        a: [[3.5248171, 2.9984862e-05, -8.6221891e-07, 2.0979721e-09, -9.8658191e-13, -12150.509, 2.40892359], [2.7665884, 0.0014381883, -4.6993e-07, 7.3499408e-11, -4.3731106e-15, -11917.468, 6.47150629]]
    },
    'F2': {
        nasa: 'F2', M: 0.03799681, T: [200, 1000, 6000], d: 'fluorine',
        a: [[3.20832415, 0.00125919179, 3.89747979e-06, -7.22184984e-09, 3.31837862e-12, -1034.25794, 5.61903589], [3.86166219, 0.000788367679, -1.8198294e-07, -9.1743656e-12, 2.65193472e-15, -1232.38655, 2.04119855]]
    },
    'HF': {
        nasa: 'HF', M: 0.0200064, T: [300, 1000, 5000], d: 'hydrogen fluoride',
        a: [[3.4379986, 0.00053571598, -1.5229655e-06, 1.7564491e-09, -5.786994e-13, -33818.972, 1.20618177], [2.991911, 0.00071489475, -6.8630973e-08, -1.161713e-11, 1.9412375e-15, -33621.364, 3.82549527]]
    },
    'CH4': {
        nasa: 'CH4', M: 0.016043, T: [200, 1000, 6000], d: 'methane',
        a: [[5.14987613, -0.0136709788, 4.91800599e-05, -4.84743026e-08, 1.66693956e-11, -10246.6476, -4.64130376], [1.63552643, 0.0100842795, -3.36916254e-06, 5.34958667e-10, -3.15518833e-14, -10005.6455, 9.99313326]]
    },
    'C2H6': {
        nasa: 'C2H6', M: 0.03007, T: [200, 1000, 6000], d: 'ethane',
        a: [[4.29142492, -0.0055015427, 5.99438288e-05, -7.08466285e-08, 2.68685771e-11, -11522.2055, 2.66682316], [4.04666674, 0.0153538766, -5.47039321e-06, 8.77826228e-10, -5.23167305e-14, -12447.3512, -0.968683607]]
    },
    'C3H8': {
        nasa: 'C3H8', M: 0.044097, T: [200, 1000, 6000], d: 'propane',
        a: [[4.2110262, 0.00171599803, 7.06183472e-05, -9.19594116e-08, 3.64421372e-11, -14381.2106, 5.60930491], [6.66789363, 0.0206120214, -7.36553027e-06, 1.18440761e-09, -7.0695321e-14, -16274.8521, -13.1859503]]
    },
    'nC4H10': {
        nasa: 'C4H10,n-butane', M: 0.058124, T: [200, 1000, 6000], d: 'n-butane',
        a: [[6.14746806, 0.000155947389, 9.67913517e-05, -1.2548391e-07, 4.97816555e-11, -17599.4402, -1.09409879], [9.44535834, 0.0257858073, -9.23619122e-06, 1.48632755e-09, -8.87897158e-14, -20138.2165, -26.3470076]]
    },
    'iC4H10': {
        nasa: 'C4H10,isobutane', M: 0.058124, T: [200, 1000, 6000], d: 'isobutane',
        a: [[4.45479276, 0.00826057985, 8.29886664e-05, -1.14647642e-07, 4.64570101e-11, -18459.3931, 4.92743175], [9.76991245, 0.025499721, -9.14142932e-06, 1.47328271e-09, -8.80800188e-14, -21405.2647, -30.0329101]]
    },
    'nC5H12': {
        nasa: 'C5H12,n-pentane', M: 0.072151, T: [298.15, 1000, 5000], d: 'n-pentane',
        a: [[1.8983679, 0.041203037, 1.2312175e-05, -3.6589501e-08, 1.5042509e-11, -20091.5, 18.679082], [13.546998, 0.028421786, -9.4174648e-06, 1.3893589e-09, -7.4212609e-14, -24577.68, -47.021175]]
    },
    'nC7H16': {
        nasa: 'C7H16,n-heptane', M: 0.100205, T: [200, 1000, 6000], d: 'n-heptane',
        a: [[11.1532484, -0.00949415433, 0.000195571181, -2.4975252e-07, 9.84873213e-11, -26771.1735, -15.909611], [18.5354704, 0.0391420468, -1.38030268e-05, 2.22403874e-09, -1.3345258e-13, -31950.0783, -70.190284]]
    },
    'nC8H18': {
        nasa: 'C8H18,n-octane', M: 0.114232, T: [200, 1000, 6000], d: 'n-octane',
        a: [[12.5244908, -0.0101018365, 0.000221991595, -2.8486242e-07, 1.12409624e-10, -29843.3034, -19.7108554], [22.1755407, 0.0424426161, -1.49161103e-05, 2.40376673e-09, -1.44359037e-13, -36103.0944, -88.0854457]]
    },
    'iC8H18': {
        nasa: 'C8H18,isooctane', M: 0.114232, T: [200, 1000, 6000], d: 'isooctane (2,2,4-trimethylpentane)',
        a: [[0.815737338, 0.0732643959, 1.78300688e-05, -6.9358962e-08, 3.21629382e-11, -30477.2862, 24.1509994], [15.9899273, 0.055318479, -1.95267072e-05, 3.11779172e-09, -1.85312577e-13, -35875.7973, -60.1161414]]
    },
    'C2H4': {
        nasa: 'C2H4', M: 0.028054, T: [200, 1000, 6000], d: 'ethylene',
        a: [[3.95920148, -0.00757052247, 5.70990292e-05, -6.91588753e-08, 2.69884373e-11, 5089.77593, 4.09733096], [3.99182761, 0.010483391, -3.71721385e-06, 5.94628514e-10, -3.53630526e-14, 4268.65819, -0.269052151]]
    },
    'C2H2': {
        nasa: 'C2H2,acetylene', M: 0.026038, T: [200, 1000, 6000], d: 'acetylene',
        a: [[0.808681094, 0.0233615629, -3.55171815e-05, 2.80152437e-08, -8.50072974e-12, 26428.9807, 13.9397051], [4.65878504, 0.00488396547, -1.60828775e-06, 2.46974226e-10, -1.3860568e-14, 25759.4044, -3.99834772]]
    },
    'C3H6': {
        nasa: 'C3H6,propylene', M: 0.042081, T: [200, 1000, 6000], d: 'propylene',
        a: [[3.83464524, 0.00329078405, 5.05228184e-05, -6.66251418e-08, 2.63707585e-11, 753.838295, 7.53410995], [6.03870499, 0.0162963895, -5.82130624e-06, 9.35936483e-10, -5.58602903e-14, -776.595092, -8.43824322]]
    },
    'C6H6': {
        nasa: 'C6H6', M: 0.078114, T: [200, 1000, 6000], d: 'benzene',
        a: [[0.503469664, 0.0185142363, 7.37864409e-05, -1.18106127e-07, 5.07182527e-11, 8552.66293, 21.6481796], [11.0771708, 0.0207067895, -7.516251e-06, 1.22209416e-09, -7.35312513e-14, 4309.88395, -40.011695]]
    },
    'C7H8': {
        nasa: 'C7H8', M: 0.092141, T: [200, 1000, 6000], d: 'toluene',
        a: [[1.611914, 0.0211188902, 8.53221453e-05, -1.32566876e-07, 5.59406109e-11, 4096.51976, 20.2973614], [12.939475, 0.0266921558, -9.68420108e-06, 1.5739214e-09, -9.46670482e-14, -677.035769, -46.7255302]]
    },
    'CH3OH': {
        nasa: 'CH3OH', M: 0.032042, T: [200, 1000, 6000], d: 'methanol',
        a: [[5.71539582, -0.0152309129, 6.52441155e-05, -7.10806889e-08, 2.61352698e-11, -25642.7656, -1.50409823], [3.60134486, 0.0102430954, -3.59985517e-06, 5.72505986e-10, -3.3911764e-14, -25997.191, 4.70512253]]
    },
    'C2H5OH': {
        nasa: 'C2H5OH', M: 0.046069, T: [200, 1000, 6000], d: 'ethanol',
        a: [[4.85868178, -0.0037400674, 6.95550267e-05, -8.86541147e-08, 3.5168443e-11, -29996.1309, 4.80192294], [6.5628977, 0.0152034264, -5.38922247e-06, 8.62150224e-10, -5.12824683e-14, -31525.7984, -9.47557644]]
    },
    'CH3OCH3': {
        nasa: 'CH3OCH3', M: 0.046069, T: [200, 1000, 6000], d: 'dimethyl ether',
        a: [[5.30562279, -0.00214254272, 5.30873244e-05, -6.23147136e-08, 2.30731036e-11, -23986.6295, 0.713264209], [5.64844183, 0.0163381899, -5.86802367e-06, 9.46836869e-10, -5.66504738e-14, -25107.469, -5.96264939]]
    },
    'C': {
        nasa: 'C', M: 0.012011, T: [200, 1000, 6000], d: 'atomic carbon (gas); solid carbon is not included',
        a: [[2.55423955, -0.000321537724, 7.33792245e-07, -7.32234889e-10, 2.66521446e-13, 85443.8832, 4.53130848], [2.60558298, -0.000195934335, 1.06737219e-07, -1.6423939e-11, 8.18705752e-16, 85412.9443, 4.19238681]]
    },
};

class IdealGas {
    static R = 8.31446261815324;          // J/(mol K), CODATA 2018
    static P0 = 100000;                   // Pa, standard-state pressure of the tabulated entropies
    static TREF = 298.15;                 // K

    // CODATA 2018 values, SI units. key: [value, unit, description, ...aliases]
    static CONSTS = {
        stefanboltzmann: [5.670374419e-08, 'W/(m^2 K^4)', 'Stefan-Boltzmann constant', 'sigma'],
        gasconstant: [8.31446261815324, 'J/(mol K)', 'Universal gas constant', 'R_u', 'Ru'],
        boltzmann: [1.380649e-23, 'J/K', 'Boltzmann constant', 'k_B', 'kB'],
        avogadro: [6.02214076e+23, '1/mol', 'Avogadro constant', 'N_A'],
        speedoflight: [299792458, 'm/s', 'Speed of light in vacuum', 'c'],
        planck: [6.62607015e-34, 'J s', 'Planck constant', 'h_planck'],
        gravity: [9.80665, 'm/s^2', 'Standard gravitational acceleration', 'g'],
        gravitation: [6.6743e-11, 'm^3/(kg s^2)', 'Newtonian constant of gravitation', 'G_N'],
        atm: [101325, 'Pa', 'Standard atmosphere', 'standardatmosphere'],
        zerocelsius: [273.15, 'K', '0 degC in kelvin', 'T_0'],
        faraday: [96485.33212331001, 'C/mol', 'Faraday constant', 'F'],
        elementarycharge: [1.602176634e-19, 'C', 'Elementary charge', 'e_charge'],
        vacuumpermittivity: [8.8541878128e-12, 'F/m', 'Vacuum permittivity', 'eps_0'],
        vacuumpermeability: [1.25663706212e-06, 'N/A^2', 'Vacuum permeability', 'mu_0'],
        electronmass: [9.1093837015e-31, 'kg', 'Electron mass', 'm_e'],
        protonmass: [1.67262192369e-27, 'kg', 'Proton mass', 'm_p'],
        atomicmassunit: [1.6605390666e-27, 'kg', 'Atomic mass unit', 'amu'],
    };

    static _cIndex = null;
    static constantInfo(name) {
        if (!IdealGas._cIndex) {
            IdealGas._cIndex = {};
            for (const [k, v] of Object.entries(IdealGas.CONSTS)) {
                IdealGas._cIndex[k.toLowerCase()] = k;
                v.slice(3).forEach(al => IdealGas._cIndex[al.toLowerCase()] = k);
            }
        }
        const key = IdealGas._cIndex[String(name).trim().toLowerCase()];
        if (!key) return null;
        const c = IdealGas.CONSTS[key];
        return { key, value: c[0], unit: c[1], desc: c[2] };
    }
    static constant(args) {
        if (args.length !== 1) throw new Error("constant(): use constant('name'), for example constant('sigma')");
        const c = IdealGas.constantInfo(args[0]);
        if (!c) throw new Error(`constant(): unknown constant '${args[0]}'. See the list in the Help page.`);
        return c.value;
    }

    // Reference atmosphere for chemical exergy: Moran and Shapiro, Fundamentals of Engineering Thermodynamics, Sec. 13.6
    // and Table 13.4: T0 = 298.15 K, p0 = 1 atm, ideal gas of N2 75.67 %, O2 20.35 %, H2O(g) 3.12 %, CO2 0.03 %, other 0.83 % (molar)
    static ENV = { N2: 0.7567, O2: 0.2035, H2O: 0.0312, CO2: 0.0003 };
    // Atoms of a species from its formula key: 'nC4H10' -> { C: 4, H: 10 }, 'CH3OCH3' -> { C: 2, H: 6, O: 1 }
    static formula(key) {
        const f = key.replace(/^[ni](?=[A-Z])/, ''), atoms = {};
        for (const m of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) atoms[m[1]] = (atoms[m[1]] || 0) + (m[2] ? +m[2] : 1);
        return atoms;
    }

    static _sIndex = null;
    static species(name) {
        if (!IdealGas._sIndex) {
            IdealGas._sIndex = {};
            for (const [k, v] of Object.entries(IDEAL_GAS_DB)) {
                IdealGas._sIndex[k.toLowerCase()] = k;
                IdealGas._sIndex[v.d.toLowerCase().replace(/ \(.*\)$/, '').replace(/\s+/g, '')] = k;
                if (v.nasa) IdealGas._sIndex[v.nasa.toLowerCase()] = k;
            }
        }
        const key = IdealGas._sIndex[String(name).trim().toLowerCase().replace(/\s+/g, '')];
        if (!key) throw new Error(`ideal-gas species '${name}' is not in the table (see the Help page for the list)`);
        return { key, rec: IDEAL_GAS_DB[key] };
    }
    static _poly(sp, T, fname) {
        const { key, rec } = sp;
        const lo = Math.min(rec.T[0], IdealGas.TREF), hi = rec.T[rec.T.length - 1];
        if (!(T >= lo && T <= hi)) throw new Error(`${fname}: T = ${T} K is outside the valid range ${lo} to ${hi} K for ${key}`);
        let i = 0;
        while (i < rec.a.length - 1 && T >= rec.T[i + 1]) i++;
        return rec.a[i];
    }
    static cpR(a, T) { return a[0] + T * (a[1] + T * (a[2] + T * (a[3] + T * a[4]))); }
    static hRT(a, T) { return a[0] + T * (a[1] / 2 + T * (a[2] / 3 + T * (a[3] / 4 + T * a[4] / 5))) + a[5] / T; }
    static s0R(a, T) { return a[0] * Math.log(T) + T * (a[1] + T * (a[2] / 2 + T * (a[3] / 3 + T * a[4] / 4))) + a[6]; }

    // args: [species, T, (P)]; all SI. Results per mole.
    static evaluate(name, args) {
        const R = IdealGas.R;
        const num = (x, what) => { const v = Number(x); if (typeof x === 'object' || !Number.isFinite(v)) throw new Error(`${name}(): ${what} must be a number, got '${x}'`); return v; };
        if (name === 'ig_mixingexergy') {
            if (args.length !== 3) throw new Error('ig_mixingexergy(): use ig_mixingexergy(y, y0, T0)');
            const y = num(args[0], 'y'), y0 = num(args[1], 'y0'), T0 = num(args[2], 'T0');
            if (!(y > 0 && y <= 1 && y0 > 0 && y0 <= 1)) throw new Error('ig_mixingexergy(): the mole fractions y and y0 must be above 0 and at most 1');
            if (!(T0 > 0)) throw new Error('ig_mixingexergy(): T0 must be positive (K)');
            return R * T0 * Math.log(y / y0);
        }
        if (args.length < 1) throw new Error(`${name}(): the first argument is the species, for example ${name}('CO2', T)`);
        const sp = IdealGas.species(args[0]);
        if (name === 'ig_exergy') {   // physical: from T, P to the dead state T0, P0
            if (args.length !== 5) throw new Error("ig_exergy(): use ig_exergy('species', T, P, T0, P0)");
            const [T, P, T0, P0] = args.slice(1).map((x, i) => num(x, ['T', 'P', 'T0', 'P0'][i]));
            if (!(T > 0 && P > 0 && T0 > 0 && P0 > 0)) throw new Error('ig_exergy(): T, P, T0 and P0 must be positive (K and Pa)');
            const f = (fn, ...x) => IdealGas.evaluate(fn, [sp.key, ...x]);
            return f('ig_enthalpy', T) - f('ig_enthalpy', T0) - T0 * (f('ig_entropy', T, P) - f('ig_entropy', T0, P0));
        }
        if (name === 'ig_chemicalexergy') {
            // Moran and Shapiro, Eq. 13.36: the species reacts with O2 from the atmosphere to CO2, H2O(g) and N2, all at T0, P0,
            // which then expand to their partial pressures in the atmosphere:
            // e_ch = g + nO2 g_O2 - c g_CO2 - h/2 g_H2O - n/2 g_N2 + R T0 ln(y_O2^nO2 / (y_CO2^c y_H2O^(h/2) y_N2^(n/2)))
            if (!(args.length === 1 || (args.length >= 3 && args.length % 2 === 1)))
                throw new Error("ig_chemicalexergy(): use ig_chemicalexergy('species'), ('species', T0, P0), or ('species', T0, P0, 'CO2', y, ...) for an atmosphere with other mole fractions");
            const T0 = args.length > 1 ? num(args[1], 'T0') : IdealGas.TREF, P0 = args.length > 1 ? num(args[2], 'P0') : 101325;
            if (!(T0 > 0 && P0 > 0)) throw new Error('ig_chemicalexergy(): T0 and P0 must be positive (K and Pa)');
            const env = { ...IdealGas.ENV };
            for (let k = 3; k < args.length; k += 2) {
                const g = String(args[k]).trim().toUpperCase();
                if (!(g in env)) throw new Error(`ig_chemicalexergy(): the gases of the atmosphere that can be set are N2, O2, H2O and CO2, not '${args[k]}'`);
                const y = num(args[k + 1], `the mole fraction of ${g}`);
                if (!(y > 0 && y < 1)) throw new Error(`ig_chemicalexergy(): the mole fraction of ${g} must be between 0 and 1`);
                env[g] = y;
            }
            const at = IdealGas.formula(sp.key), other = Object.keys(at).filter(e => !['C', 'H', 'O', 'N'].includes(e));
            if (other.length) throw new Error(`ig_chemicalexergy(): ${sp.key} contains ${other.join(', ')}; only species made of C, H, O and N are covered, whose reference substances are gases of the atmosphere`);
            const c = at.C || 0, h = at.H || 0, o = at.O || 0, n = at.N || 0;
            const gib = (s) => IdealGas.evaluate('ig_gibbs', [s, T0, P0]);
            let e = gib(sp.key), ln = 0;
            for (const [s, v] of [['O2', c + h / 4 - o / 2], ['CO2', -c], ['H2O', -h / 2], ['N2', -n / 2]]) {
                if (v === 0) continue;
                e += v * gib(s); ln += v * Math.log(env[s]);
            }
            return e + R * T0 * ln;
        }
        if (name === 'ig_molarmass') return sp.rec.M;
        if (name === 'ig_formationenthalpy') { const T = IdealGas.TREF; return IdealGas.hRT(IdealGas._poly(sp, T, name), T) * R * T; }
        if (args.length < 2 || args.length > 3) throw new Error(`${name}(): use ${name}('species', T${name === 'ig_entropy' || name === 'ig_gibbs' ? ' [, P]' : ''})`);
        const T = num(args[1], 'T');
        const P = args.length === 3 ? num(args[2], 'P') : IdealGas.P0;
        if (!(T > 0) || !(P > 0)) throw new Error(`${name}(): T and P must be positive (K and Pa)`);
        const a = IdealGas._poly(sp, T, `${name}('${sp.key}')`);
        const h = IdealGas.hRT(a, T) * R * T;
        const s = (IdealGas.s0R(a, T) - Math.log(P / IdealGas.P0)) * R;
        switch (name) {
            case 'ig_enthalpy': return h;
            case 'ig_internalenergy': return h - R * T;
            case 'ig_entropy': return s;
            case 'ig_gibbs': return h - T * s;
            case 'ig_cp': return IdealGas.cpR(a, T) * R;
        }
        throw new Error(`${name}(): unknown ideal-gas function`);
    }
}

// ==========================================
// 1b. WATER BELOW THE TRIPLE POINT: ICE Ih AND LOW-TEMPERATURE VAPOR
// ==========================================
// Ice Ih: IAPWS R10-06(2009), Revised Release on the Equation of State 2006 for H2O Ice Ih (Feistel and Wagner), a Gibbs
// function g(T, p) valid for 0 <= T <= 273.16 K, 0 < p <= 210 MPa, with the entropy constant consistent with IAPWS-95, so
// ice shares CoolProp's reference state for water (u = s = 0 for the liquid at the triple point).
// Sublimation and melting curves: IAPWS R14-08(2011). Thermal conductivity (no IAPWS formulation exists): k = 612/T W/(m K),
// N. S. Wolfenbarger et al., Data in Brief 36 (2021) 107079 and arXiv:2011.12502, 30 to 273 K.
// Vapor below the triple point: IAPWS-95 through CoolProp with the gas phase imposed (its plain pressure-temperature input
// refuses T < 273.16 K).
const IceIh = (() => {
    const Tt = 273.16, pt = 611.657, p0 = 101325;
    const g0 = [-0.632020233335886e6, 0.655022213658955, -0.189369929326131e-7, 0.339746123271053e-14, -0.556464869058991e-21];   // J/kg
    const s0 = -0.332733756492168e4;                                                                                            // J/(kg K)
    const t1 = [0.368017112855051e-1, 0.510878114959572e-1], r1 = [0.447050716285388e2, 0.656876847463481e2];                      // r in J/(kg K)
    const t2 = [0.337315741065416, 0.335449415919309];
    const r2k = [[-0.725974574329220e2, -0.781008427112870e2], [-0.557107698030123e-4, 0.464578634580806e-4], [0.234801409215913e-10, -0.285651142904972e-10]];
    // complex helpers on [re, im]
    const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]], sc = (a, k) => [a[0] * k, a[1] * k];
    const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
    const ln = (a) => [Math.log(Math.hypot(a[0], a[1])), Math.atan2(a[1], a[0])];
    const R = (t, tau) => {   // the bracket of the Gibbs function and its first two tau derivatives, for one complex t
        const tm = sub(t, [tau, 0]), tp = add(t, [tau, 0]);
        const f = sub(add(add(mul(tm, ln(tm)), mul(tp, ln(tp))), sc(mul(t, ln(t)), -2)), div([tau * tau, 0], t));
        const ft = add(sub(ln(tp), ln(tm)), div([-2 * tau, 0], t));
        const ftt = sub(add(div([1, 0], tm), div([1, 0], tp)), div([2, 0], t));
        return [f, ft, ftt];
    };
    const gibbs = (T, p) => {
        const tau = T / Tt, d = (p - p0) / pt;
        let G0 = 0, G0p = 0, G0pp = 0;
        for (let k = 0; k < 5; k++) G0 += g0[k] * d ** k;
        for (let k = 1; k < 5; k++) G0p += g0[k] * k * d ** (k - 1) / pt;
        for (let k = 2; k < 5; k++) G0pp += g0[k] * k * (k - 1) * d ** (k - 2) / pt ** 2;
        let r2 = [0, 0], r2p = [0, 0];
        for (let k = 0; k < 3; k++) r2 = add(r2, sc(r2k[k], d ** k));
        for (let k = 1; k < 3; k++) r2p = add(r2p, sc(r2k[k], k * d ** (k - 1) / pt));
        const r2pp = sc(r2k[2], 2 / pt ** 2);
        const [f1, f1t, f1tt] = R(t1, tau), [f2, f2t, f2tt] = R(t2, tau);
        return {
            g: G0 - s0 * Tt * tau + Tt * (mul(r1, f1)[0] + mul(r2, f2)[0]),
            gT: -s0 + mul(r1, f1t)[0] + mul(r2, f2t)[0],
            gTT: (mul(r1, f1tt)[0] + mul(r2, f2tt)[0]) / Tt,
            gp: G0p + Tt * mul(r2p, f2)[0],
            gTp: mul(r2p, f2t)[0],
            gpp: G0pp + Tt * mul(r2pp, f2)[0],
        };
    };
    const M = 0.018015268;
    const props = (T, p) => {
        const G = gibbs(T, p), v = G.gp, cp = -T * G.gTT, alpha = G.gTp / G.gp, kT = -G.gpp / G.gp, k = 612 / T;
        return {
            T, P: p, Q: -1, G: G.g, S: -G.gT, H: G.g - T * G.gT, U: G.g - T * G.gT - p * G.gp, Helmholtzmass: G.g - p * G.gp, D: 1 / v, V_SPEC: v,
            Cpmass: cp, Cvmass: cp - T * v * alpha * alpha / kT, isobaric_expansion_coefficient: alpha, isothermal_compressibility: kT, L: k, ALPHA: k * G.gp / cp, Phase: 9,
            Hmolar: (G.g - T * G.gT) * M, Smolar: -G.gT * M, Umolar: (G.g - T * G.gT - p * G.gp) * M, Gmolar: G.g * M, Cpmolar: cp * M, Cvmolar: (cp - T * v * alpha * alpha / kT) * M, Dmolar: 1 / (v * M)
        };
    };
    // Sublimation and melting (ice Ih) pressures, R14-08(2011), and their inverses
    const psub = (T) => { const th = T / Tt; return pt * Math.exp((-0.212144006e2 * th ** 0.333333333e-2 + 0.273203819e2 * th ** 1.20666667 - 0.61059813e1 * th ** 1.70333333) / th); };
    const pmelt = (T) => { const th = T / Tt; return pt * (1 + 0.119539337e7 * (1 - th ** 3) + 0.808183159e5 * (1 - th ** 25.75) + 0.33382686e4 * (1 - th ** 103.75)); };
    const bisect = (f, lo, hi) => { for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; if (hi - lo < 1e-14 * hi) break; } return (lo + hi) / 2; };
    const Tsub = (p) => bisect((T) => psub(T) - p, 50, Tt);          // psub increases with T
    const Tmelt = (p) => bisect((T) => p - pmelt(T), 251.165, Tt);     // pmelt decreases with T
    return { Tt, pt, M, gibbs, props, psub, pmelt, Tsub, Tmelt, pIII: 208.566e6, TIII: 251.165 };
})();

const WaterBelowTriple = {
    names: new Set(['water', 'h2o', 'heos::water', 'ice', 'steam']),
    is(fluid) { return WaterBelowTriple.names.has(String(fluid).trim().toLowerCase()); },
    // A fluid state below the triple-point temperature (vapor at low pressure, or liquid on the melting curve), by IAPWS-95
    // through CoolProp with the phase imposed ('T|gas' or 'T|liquid'), which lifts its T >= 273.16 K limit
    fluid(CP, T, p, liquid) {
        const tk = liquid ? 'T|liquid' : 'T|gas';
        const raw = (key) => { const v = CP.PropsSI(key, tk, T, 'P', p, 'Water'); if (!Number.isFinite(v)) ThermoEngine.fail(CP, `${key} of water at T = ${T} K, p = ${p} Pa`); return v; };
        const get = (key) => {
            if (key === 'T') return T; if (key === 'P') return p; if (key === 'Q') return -1;
            if (key === 'V_SPEC') return 1 / raw('D');
            if (key === 'ALPHA') return raw('L') / (raw('D') * raw('Cpmass'));
            if (key === 'NU') return raw('V') / raw('D');
            if (key === 'Phase') return liquid ? 0 : 5;
            return raw(key);
        };
        return { get, phase: liquid ? 'liquid' : 'vapor' };
    },
    ice(T, p) {
        if (T > IceIh.Tt + 1e-9) throw new Error(`ice at T = ${T} K: above the triple point (273.16 K) ice Ih is not stable`);
        const st = IceIh.props(T, p);
        const get = (key) => {
            if (key in st) return st[key];
            const what = { V: 'viscosity', Prandtl: 'Prandtl number', NU: 'kinematic viscosity', A: 'speed of sound', I: 'surface tension' }[key] || `'${key}'`;
            throw new Error(`${what} is not defined for ice (water at T = ${+T.toPrecision(6)} K, p = ${+p.toPrecision(6)} Pa is solid)`);
        };
        return { get, phase: 'ice' };
    },
    // Which phase is stable at (T, p) below the triple-point temperature: 'vapor', 'ice' or 'liquid'
    region(T, p) {
        if (T >= IceIh.Tt) return null;
        if (T < 50) throw new Error(`water at T = ${T} K: the sublimation curve of ice is defined from 50 K`);
        if (p < IceIh.psub(T)) return 'vapor';
        if (T < IceIh.TIII) { if (p > IceIh.pIII) throw new Error(`water at T = ${T} K, p = ${p} Pa: ice III or a denser ice is stable there; only ice Ih is available`); return 'ice'; }
        return p <= IceIh.pmelt(T) ? 'ice' : 'liquid';
    },
    stateTP(CP, T, p) {
        const r = WaterBelowTriple.region(T, p);
        if (r === null) return null;
        if (r === 'ice') return WaterBelowTriple.ice(T, p);
        if (r === 'liquid') return null;   // CoolProp handles the liquid above the melting curve
        return WaterBelowTriple.fluid(CP, T, p, false);
    },
    // Dispatch on the input pair; null means "an ordinary fluid state: let CoolProp do it"
    state(CP, k1, v1, k2, v2) {
        const pair = {}; pair[k1] = v1; pair[k2] = v2;
        if ('T' in pair && 'P' in pair) return WaterBelowTriple.stateTP(CP, pair.T, pair.P);
        if ('Q' in pair && ('T' in pair || 'P' in pair)) {
            if ('T' in pair && pair.T < IceIh.Tt) return WaterBelowTriple.stateSub(CP, pair.T, IceIh.psub(pair.T), pair.Q);
            if ('P' in pair && pair.P < IceIh.pt) return WaterBelowTriple.stateSub(CP, IceIh.Tsub(pair.P), pair.P, pair.Q);
            return null;
        }
        if ('P' in pair && ('H' in pair || 'S' in pair)) return WaterBelowTriple.stateP(CP, pair.P, 'H' in pair ? 'H' : 'S', 'H' in pair ? pair.H : pair.S);
        return null;
    },
    outKey(o) {   // CoolProp output names accepted by props() for ice, to the keys used here
        const l = o.toLowerCase();
        const m = {
            h: 'H', hmass: 'H', s: 'S', smass: 'S', u: 'U', umass: 'U', g: 'G', gmass: 'G', d: 'D', dmass: 'D', t: 'T', p: 'P', q: 'Q', c: 'Cpmass', cpmass: 'Cpmass', o: 'Cvmass', cvmass: 'Cvmass',
            l: 'L', conductivity: 'L', helmholtzmass: 'Helmholtzmass', hmolar: 'Hmolar', smolar: 'Smolar', umolar: 'Umolar', gmolar: 'Gmolar', cpmolar: 'Cpmolar', cvmolar: 'Cvmolar', dmolar: 'Dmolar',
            isobaric_expansion_coefficient: 'isobaric_expansion_coefficient', isothermal_compressibility: 'isothermal_compressibility', phase: 'Phase'
        };
        return m[l] || o;
    },
    // Sublimation equilibrium: Q = 0 ice, Q = 1 vapor, in between a mixture (extensive properties only)
    stateSub(CP, T, p, Q) {
        if (!(Q >= 0 && Q <= 1)) throw new Error(`quality ${Q} must be between 0 and 1`);
        const s = WaterBelowTriple.ice(T, p), v = WaterBelowTriple.fluid(CP, T, p, false);
        if (Q === 0) return { get: (k) => k === 'Q' ? 0 : s.get(k), phase: 'ice' };
        if (Q === 1) return { get: (k) => k === 'Q' ? 1 : v.get(k), phase: 'vapor' };
        return WaterBelowTriple.mix(s, v, Q, T, p);
    },
    mix(a, b, Q, T, p) {   // a two-phase mixture, quality Q of phase b by mass
        const lin = (k) => (1 - Q) * a.get(k) + Q * b.get(k);
        const get = (k) => {
            if (k === 'Q') return Q; if (k === 'T') return T; if (k === 'P') return p;
            if (['H', 'S', 'U', 'G', 'Helmholtzmass', 'V_SPEC'].includes(k)) return lin(k);
            if (['Hmolar', 'Smolar', 'Umolar', 'Gmolar'].includes(k)) return lin(k);
            if (k === 'D') return 1 / lin('V_SPEC');
            if (k === 'Dmolar') return 1 / lin('V_SPEC') / IceIh.M;
            if (k === 'Phase') return 6;
            throw new Error(`'${k}' is not defined for a two-phase mixture (quality ${Q})`);
        };
        return { get, phase: 'mixture' };
    },
    // (p, h) or (p, s) below the triple point, or in the ice region above it: ice, a mixture on the phase boundary, or fluid
    stateP(CP, p, key, y) {
        if (p > IceIh.pIII) return null;
        const below = p < IceIh.pt;
        const Tb = below ? IceIh.Tsub(p) : IceIh.Tmelt(p);
        const sb = WaterBelowTriple.ice(Tb, p), fb = WaterBelowTriple.fluid(CP, Tb, p, !below);
        const ys = sb.get(key), yf = fb.get(key);
        if (y >= yf) return below ? WaterBelowTriple.solveT(CP, p, key, y, Tb, 'vapor') : null;   // fluid side: CoolProp above the triple point
        if (y > ys) { const Q = (y - ys) / (yf - ys); return WaterBelowTriple.mix(sb, fb, Q, Tb, p); }
        return WaterBelowTriple.solveT(CP, p, key, y, Tb, 'ice');
    },
    solveT(CP, p, key, y, Tb, phase) {   // the temperature at which the ice (or low-pressure vapor) property equals y
        const at = (T) => phase === 'ice' ? WaterBelowTriple.ice(T, p) : WaterBelowTriple.fluid(CP, T, p, false);
        let lo = phase === 'ice' ? 1 : Tb, hi = phase === 'ice' ? Tb : IceIh.Tt;
        if (phase === 'vapor' && at(hi).get(key) < y) return null;   // the vapor is above 273.16 K: CoolProp handles it
        if (phase === 'ice' && at(lo).get(key) > y) throw new Error(`no ice state at p = ${p} Pa has ${key === 'H' ? 'h' : 's'} = ${y}`);
        for (let k = 0; k < 100 && hi - lo > 1e-12 * hi; k++) { const m = (lo + hi) / 2; if (at(m).get(key) < y) lo = m; else hi = m; }
        return at((lo + hi) / 2);
    },
};

// ==========================================
// LiBr-H2O solutions at vapor-liquid equilibrium: J. Patek and J. Klomfar, A computationally effective formulation of
// the thermodynamic properties of LiBr-H2O solutions from 273 to 500 K over full composition range, Int. J. Refrig. 29
// (2006) 566-578. Each property is that of saturated liquid water at T (IAPWS-95, from CoolProp) weighted by the mole
// fraction of water, plus a correction in the mole fraction x of LiBr: Eqs. (1)-(5), Tables 4-8. The water reference
// is that of IAPWS-95 (liquid at the triple point: u = 0, s = 0), as for steam, so solution and steam enthalpies can be
// used together in energy balances. Inputs and outputs here are SI and per kg; the concentration is the LiBr mass fraction.
class LiBrH2O {
    static M_LiBr = 0.08685; static M_H2O = 0.018015268;            // kg/mol
    static Tc = 647.096; static T0 = 221;                            // K
    static hc = 37548.5; static sc = 79.3933; static cpt = 76.0226;  // J/mol, J/(mol K), J/(mol K)
    static rhoc = 17873;                                             // mol/m^3
    static P = {
        a: [-2.41303e2, 1.91750e7, -1.75521e8, 3.25432e7, 3.92571e2, -2.12626e3, 1.85127e8, 1.91216e3],
        m: [3, 4, 4, 8, 1, 1, 4, 6], n: [0, 5, 6, 3, 0, 2, 6, 0], t: [0, 0, 0, 0, 1, 1, 1, 1]
    };
    static RHO = { a: [1.746, 4.709], m: [1, 1], t: [0, 6] };
    static CPT = {
        a: [-14.2094, 40.4943, 111.135, 229.980, 1345.26, -0.0141010, 0.0124977, -0.000683209],
        m: [2, 3, 3, 3, 3, 2, 1, 1], n: [0, 0, 1, 2, 3, 0, 3, 2], t: [0, 0, 0, 0, 0, 2, 3, 4]
    };
    static H = {
        a: [2.27431, -7.99511, 385.239, -16394, -422.562, 0.113314, -8.33474, -17383.3, 6.49763, 3245.52, -13464.3,
            39932.2, -258877, -0.00193046, 2.80616, -40.4479, 145.342, -2.74873, -449.743, -12.1794, -0.00583739, 0.233910,
            0.341888, 8.85259, -17.8731, 0.0735179, -0.000179430, 0.00184261, -0.00624282, 0.00684765],
        m: [1, 1, 2, 3, 6, 1, 3, 5, 4, 5, 5, 6, 6, 1, 2, 2, 2, 5, 6, 7, 1, 1, 2, 2, 2, 3, 1, 1, 1, 1],
        n: [0, 1, 6, 6, 2, 0, 0, 4, 0, 4, 5, 5, 6, 0, 3, 5, 7, 0, 3, 1, 0, 4, 2, 6, 7, 0, 0, 1, 2, 3],
        t: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5]
    };
    static S = {
        a: [1.53091, -4.52564, 698.302, -21666.4, -1475.33, 0.0847012, -6.59523, -29533.1, 0.00956314, -0.188679,
            9.31752, 5.78104, 13893.1, -17176.2, 415.108, -55564.7, -0.00423409, 30.5242, -1.67620, 14.8283, 0.00303055,
            -0.0401810, 0.149252, 2.59240, -0.177421, -0.0000699650, 0.000605007, -0.00165228, 0.00122966],
        m: [1, 1, 2, 3, 6, 1, 3, 5, 1, 2, 2, 4, 5, 5, 6, 6, 1, 3, 5, 7, 1, 1, 1, 2, 3, 1, 1, 1, 1],
        n: [0, 1, 6, 6, 2, 0, 0, 4, 0, 0, 4, 0, 4, 5, 2, 5, 0, 4, 0, 1, 0, 2, 4, 7, 1, 0, 1, 2, 3],
        t: [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 5, 5, 5, 5]
    };
    static TMIN = 273.16; static TMAX = 500; static WMAX = 0.75;
    static check(name, T, w) {
        if (!(T >= LiBrH2O.TMIN && T <= LiBrH2O.TMAX)) throw new Error(`${name}(): T = ${T} K is outside 273.16 to 500 K, the range of the formulation`);
        if (!(w >= 0 && w <= LiBrH2O.WMAX)) throw new Error(`${name}(): the LiBr mass fraction x = ${w} is outside 0 to 0.75`);
    }
    static moleFraction(w) { const L = LiBrH2O; return (w / L.M_LiBr) / (w / L.M_LiBr + (1 - w) / L.M_H2O); }
    static molarMass(xn) { return xn * LiBrH2O.M_LiBr + (1 - xn) * LiBrH2O.M_H2O; }
    static sum(c, xn, y) {   // sum of a_i x^m_i (0.4 - x)^n_i y^t_i
        let s = 0;
        for (let i = 0; i < c.a.length; i++) s += c.a[i] * xn ** c.m[i] * (c.n ? (0.4 - xn) ** c.n[i] : 1) * y ** c.t[i];
        return s;
    }
    static water(out, T) { return ThermoEngine.call('props', [out, 'water', 'T', T, 'Q', 0]); }
    static pressure(T, w) {   // Eq. (1): p(T, x) = p_sat,water(theta)
        const L = LiBrH2O; L.check('libr_pressure', T, w);
        const theta = T - L.sum(L.P, L.moleFraction(w), T / L.Tc);
        if (!(theta >= L.TMIN)) throw new Error(`libr_pressure(): T = ${T} K and x = ${w} give a water temperature of ${theta.toFixed(2)} K, below the triple point; the solution is far into crystallization`);
        return L.water('P', theta);
    }
    static molar(name, T, w) {   // per mole of solution, then per kg
        const L = LiBrH2O; L.check(name, T, w);
        const xn = L.moleFraction(w), y = L.Tc / (T - L.T0);
        let v;
        if (name === 'libr_enthalpy') v = (1 - xn) * L.water('Hmolar', T) + L.hc * L.sum(L.H, xn, y);
        else if (name === 'libr_entropy') v = (1 - xn) * L.water('Smolar', T) + L.sc * L.sum(L.S, xn, y);
        else if (name === 'libr_cp') v = (1 - xn) * L.water('Cpmolar', T) + L.cpt * L.sum(L.CPT, xn, y);
        else if (name === 'libr_density') return ((1 - xn) * L.water('Dmolar', T) + L.rhoc * L.sum(L.RHO, xn, T / L.Tc)) * L.molarMass(xn);
        return v / L.molarMass(xn);
    }
    static solve(f, lo, hi) {   // bisection on a bracketed root: f(lo) and f(hi) have opposite signs
        let flo = f(lo);
        for (let k = 0; k < 200 && hi - lo > 1e-13 * Math.max(1, Math.abs(hi)); k++) {
            const mid = (lo + hi) / 2, fm = f(mid);
            if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid;
        }
        return (lo + hi) / 2;
    }
    static evaluate(name, a) {
        const L = LiBrH2O, num = (x, what) => ThermoEngine.num(x, `${name}() ${what}`);
        if (a.length !== 2) throw new Error(`${name}(): ${ThermoEngine.FUNCS[name].desc}`);
        if (name === 'libr_pressure') return L.pressure(num(a[0], 'T'), num(a[1], 'x'));
        if (name === 'libr_temperature') {   // p rises with T
            const P = num(a[0], 'P'), w = num(a[1], 'x'); L.check(name, 300, w);
            const f = (T) => { try { return Math.log(L.pressure(T, w) / P); } catch (e) { return -Infinity; } };   // below the formulation: too low
            if (f(L.TMAX) < 0) throw new Error(`libr_temperature(): P = ${P} Pa with x = ${w} has no equilibrium temperature up to 500 K`);
            if (f(L.TMIN) > 0) throw new Error(`libr_temperature(): P = ${P} Pa with x = ${w} has no equilibrium temperature above 273.16 K`);
            return L.solve(f, L.TMIN, L.TMAX);
        }
        if (name === 'libr_concentration') {   // p falls with x
            const T = num(a[0], 'T'), P = num(a[1], 'P'); L.check(name, T, 0);
            const f = (w) => { try { return Math.log(L.pressure(T, w) / P); } catch (e) { return -Infinity; } };
            if (f(0) < 0) throw new Error(`libr_concentration(): P = ${P} Pa is above the vapor pressure of pure water at T = ${T} K (${L.water('P', T).toPrecision(5)} Pa)`);
            if (f(L.WMAX) > 0) throw new Error(`libr_concentration(): P = ${P} Pa at T = ${T} K needs a LiBr mass fraction above 0.75, the range of the formulation`);
            return L.solve(f, 0, L.WMAX);
        }
        return L.molar(name, num(a[0], 'T'), num(a[1], 'x'));
    }
}

// ==========================================
// Ammonia-water mixtures: the model of O. M. Ibrahim and S. A. Klein, Thermodynamic properties of ammonia-water mixtures,
// ASHRAE Trans. 99(1) (1993) 1495-1502, the one EES uses. Pure liquids and gases: reduced Gibbs energies (Eqs. 6 and 7, with the
// coefficients of Table 1, from Ziegler and Trepp, Int. J. Refrig. 7 (1984) 101-106; TB = 100 K, PB = 10 bar); liquid mixture:
// ideal mixing plus a three-term excess Gibbs energy (Eqs. 15-18, Table 2); vapor mixture: ideal solution; equilibrium from the
// fugacities (Eqs. 33-43), with the Poynting factors taken as 1 as the paper allows below 30 bar. The tables and equations were
// checked against the paper. Printed errors corrected: in Eq. 7 the second term of the C2 group has T_r,o^3, not T_r^3
// (the M-PROPATH correction); Eq. 15 is G^E = x (1 - x) {...}; Eq. 41 has no last term 12 F3 (1 - x)^4 (gamma of water would not
// tend to 1 for pure water). Reference state as in EES. Against 30 states computed with EES (tests/engine/nh3h2o.test.mjs):
// saturation temperatures within 0.8 K up to 360 K and within 1.5 K from there to 490 K (up to 100 bar), bubble pressure within 0.1 %,
// compositions within 0.004, liquid enthalpy within 2 kJ/kg; the vapor enthalpy of ammonia is 6.0 kJ/kg lower than EES at every
// temperature and pressure (EES's own h and s do not satisfy h_fg = T s_fg; the model's do). From about 355 K the ammonia f0 of EES
// falls below the recipe of the paper (corrA, fitted to 13 EES states). Not checked: pressures above 100 bar, temperatures above 490 K.
// x is the ammonia MASS fraction; SI units outside, kJ, kmol and bar inside.
class NH3H2O {
    static R = 8.314; static TB = 100; static PB = 10;                    // kJ/(kmol K), K, bar
    static MA = 17.03026; static MW = 18.0153;                            // kg/kmol
    static C = {
        a: {
            A: [3.971423e-2, -1.790557e-5, -1.308905e-2, 3.752836e-3], B: [1.634519e1, -6.508119, 1.448937],
            C: [-1.049377e-2, -8.288224, -6.647257e2, -3.045352e3], D: [3.673647, 9.989629e-2, 3.617622e-2],
            hl: 4.878573, hg: 26.468873, sl: 1.644773, sg: 8.339026, T0: 3.2252, P0: 2.0
        },
        w: {
            A: [2.748796e-2, -1.016665e-5, -4.452025e-3, 8.389246e-4], B: [1.214557e1, -1.898065, 2.911966e-1],
            C: [2.136131e-2, -3.169291e1, -4.634611e4, 0], D: [4.019170, -5.175550e-2, 1.951939e-2],
            hl: 21.821141, hg: 60.965058, sl: 5.733498, sg: 13.453430, T0: 5.0705, P0: 3.0
        }
    };
    static E = [-41.733398, 0.02414, 6.702285, -0.011475, 63.608967, -62.490768, 1.761064, 0.008626, 0.387983, -0.004772,
    -4.648107, 0.836376, -3.553627, 0.000904, 24.361723, -20.736547];
    static GL(c, Tr, Pr) {   // reduced Gibbs energy of a pure liquid
        const { A, B, T0, P0 } = c;
        return c.hl - Tr * c.sl + B[0] * (Tr - T0) + B[1] / 2 * (Tr ** 2 - T0 ** 2) + B[2] / 3 * (Tr ** 3 - T0 ** 3)
            - B[0] * Tr * Math.log(Tr / T0) - B[1] * Tr * (Tr - T0) - B[2] / 2 * Tr * (Tr ** 2 - T0 ** 2)
            + (A[0] + A[2] * Tr + A[3] * Tr ** 2) * (Pr - P0) + A[1] / 2 * (Pr ** 2 - P0 ** 2);
    }
    static GG(c, Tr, Pr) {   // reduced Gibbs energy of a pure gas (with the corrected C2 term)
        const { C, D, T0, P0 } = c;
        return c.hg - Tr * c.sg + D[0] * (Tr - T0) + D[1] / 2 * (Tr ** 2 - T0 ** 2) + D[2] / 3 * (Tr ** 3 - T0 ** 3)
            - D[0] * Tr * Math.log(Tr / T0) - D[1] * Tr * (Tr - T0) - D[2] / 2 * Tr * (Tr ** 2 - T0 ** 2)
            + Tr * Math.log(Pr / P0) + C[0] * (Pr - P0) + C[1] * (Pr / Tr ** 3 - 4 * P0 / T0 ** 3 + 3 * P0 * Tr / T0 ** 4)
            + C[2] * (Pr / Tr ** 11 - 12 * P0 / T0 ** 11 + 11 * P0 * Tr / T0 ** 12)
            + C[3] / 3 * (Pr ** 3 / Tr ** 11 - 12 * P0 ** 3 / T0 ** 11 + 11 * P0 ** 3 * Tr / T0 ** 12);
    }
    static GE(x, Tr, Pr) {   // reduced excess Gibbs energy of the liquid
        const E = NH3H2O.E, d = 2 * x - 1;
        const F1 = E[0] + E[1] * Pr + (E[2] + E[3] * Pr) * Tr + E[4] / Tr + E[5] / Tr ** 2;
        const F2 = E[6] + E[7] * Pr + (E[8] + E[9] * Pr) * Tr + E[10] / Tr + E[11] / Tr ** 2;
        const F3 = E[12] + E[13] * Pr + E[14] / Tr + E[15] / Tr ** 2;
        return (F1 + F2 * d + F3 * d * d) * x * (1 - x);
    }
    static xlnx(x) { return x <= 0 ? 0 : x * Math.log(x); }
    static GmL(x, Tr, Pr) { const N = NH3H2O; return x * N.GL(N.C.a, Tr, Pr) + (1 - x) * N.GL(N.C.w, Tr, Pr) + Tr * (N.xlnx(x) + N.xlnx(1 - x)) + N.GE(x, Tr, Pr); }
    static GmG(y, Tr, Pr) { const N = NH3H2O; return y * N.GG(N.C.a, Tr, Pr) + (1 - y) * N.GG(N.C.w, Tr, Pr) + Tr * (N.xlnx(y) + N.xlnx(1 - y)); }
    static mole(w) { const N = NH3H2O; return (w / N.MA) / (w / N.MA + (1 - w) / N.MW); }
    static mass(x) { const N = NH3H2O; return x * N.MA / (x * N.MA + (1 - x) * N.MW); }
    // h [kJ/kg], s [kJ/(kg K)], v [m3/kg] of one phase of mole fraction x, from G by central differences
    static phase(G, x, T, P) {
        const N = NH3H2O, Tr = T / N.TB, Pr = P / N.PB, dT = 1e-5 * Tr, dP = 1e-5 * Pr, M = x * N.MA + (1 - x) * N.MW;
        const g = G(x, Tr, Pr), sr = -(G(x, Tr + dT, Pr) - G(x, Tr - dT, Pr)) / (2 * dT), vr = (G(x, Tr, Pr + dP) - G(x, Tr, Pr - dP)) / (2 * dP);
        return { h: N.R * N.TB * (g + Tr * sr) / M, s: N.R * sr / M, v: N.R * N.TB / N.PB / 100 * vr / M };
    }
    // Equilibrium (Eqs. 33-43): the fugacity of each component in the liquid, gamma x f0, equals that in the vapor, phi P y.
    // f0 is the fugacity of the pure saturated liquid, phi_sat P_sat (the Poynting factors are taken as 1); above the critical
    // temperature of ammonia (405.4 K), where it has no saturation pressure, Gillespie's Eq. 39, shifted to join the saturated
    // value at 405.4 K (the paper gives no joining rule). phi is the fugacity coefficient of the pure gas, from the real-gas
    // terms of Eq. 7.
    static lnphi(c, T, P) {
        const Tr = T / NH3H2O.TB, Pr = P / NH3H2O.PB, C = c.C;
        return (C[0] * Pr + C[1] * Pr / Tr ** 3 + C[2] * Pr / Tr ** 11 + C[3] * Pr ** 3 / (3 * Tr ** 11)) / Tr;
    }
    static psat(c, T) {   // pure-component saturation pressure [bar], from G(liquid) = G(gas); NaN if there is none
        const N = NH3H2O, Tr = T / N.TB, f = (lp) => N.GL(c, Tr, Math.exp(lp)) - N.GG(c, Tr, Math.exp(lp));
        let lp = Math.log(1e-8), p = f(lp);
        for (; lp < Math.log(150); lp += 0.05) {
            const q = f(lp + 0.05);
            if ((q < 0) !== (p < 0)) return N.PB * Math.exp(N.bisect(f, lp, lp + 0.05, 60));
            p = q;
        }
        return NaN;
    }
    static TCA = 405.4;   // critical temperature of ammonia, K
    static gillespie(T) { const z = 1000 / T; return 10.7215 - 4.9319 * z + 1.4992 * z * z - 0.236202 * z ** 3; }   // ln f0 of ammonia, f0 in bar
    // EES's ammonia f0 falls below the recipe above (saturated value, then Gillespie's equation) from about 355 K: by 0.01 at 366 K, 0.03
    // at 387 K, 0.07 at 400 K, 0.12 at 435 K and about 0.13 beyond, independently of pressure. Fitted to 13 EES states (rms 0.007 in ln f0).
    static corrA(T) { const t = Math.max(0, (T - 354.93) / 54.27); return -0.12960 * (1 - Math.exp(-t * t)); }
    static lnSat(c, T) { const Ps = NH3H2O.psat(c, T); return Math.log(Ps) + NH3H2O.lnphi(c, T, Ps); }
    static f0cache = new Map();
    static lnf0Grid(which, T) {   // ln f0 at an integer T, cached
        const N = NH3H2O, key = which + T;
        let v = N.f0cache.get(key);
        if (v === undefined) {
            if (which === 'w' || T < N.TCA) v = N.lnSat(which === 'a' ? N.C.a : N.C.w, T);
            if (which === 'a' && !Number.isFinite(v)) {
                if (N.shiftA === undefined) N.shiftA = N.lnSat(N.C.a, N.TCA) - N.gillespie(N.TCA);
                v = N.gillespie(T) + N.shiftA;
            }
            if (!Number.isFinite(v)) throw new Error(`nh3h2o(): T = ${T} K is outside the formulation`);
            if (which === 'a') v += N.corrA(T);
            N.f0cache.set(key, v);
        }
        return v;
    }
    static lnf0(which, T) { const N = NH3H2O, k = Math.floor(T), a = N.lnf0Grid(which, k), b = N.lnf0Grid(which, k + 1); return a + (b - a) * (T - k); }
    // ammonia and water mole fractions of the vapor in equilibrium with liquid x (they add up to 1 at equilibrium)
    static yOf(x, T, P) {
        const N = NH3H2O, E = N.E, Tr = T / N.TB, Pr = P / N.PB, u = 1 - x;
        const F1 = E[0] + E[1] * Pr + (E[2] + E[3] * Pr) * Tr + E[4] / Tr + E[5] / Tr ** 2;
        const F2 = E[6] + E[7] * Pr + (E[8] + E[9] * Pr) * Tr + E[10] / Tr + E[11] / Tr ** 2;
        const F3 = E[12] + E[13] * Pr + E[14] / Tr + E[15] / Tr ** 2;
        const lga = ((F1 + 3 * F2 + 5 * F3) * u * u - 4 * (F2 + 4 * F3) * u ** 3 + 12 * F3 * u ** 4) / Tr;   // Eq. 40
        const lgw = ((F1 - 3 * F2 + 5 * F3) * x * x + 4 * (F2 - 4 * F3) * x ** 3 + 12 * F3 * x ** 4) / Tr;   // Eq. 41
        return [x * Math.exp(lga + N.lnf0('a', T) - N.lnphi(N.C.a, T, P)) / P, u * Math.exp(lgw + N.lnf0('w', T) - N.lnphi(N.C.w, T, P)) / P];
    }
    static bisect(f, lo, hi, n = 80) {   // f(lo) and f(hi) of opposite signs
        let flo = f(lo);
        for (let k = 0; k < n; k++) { const m = (lo + hi) / 2, fm = f(m); if ((fm < 0) === (flo < 0)) { lo = m; flo = fm; } else hi = m; }
        return (lo + hi) / 2;
    }
    // bubble temperature of liquid x (mole) at P, and the vapor in equilibrium
    static bubble(x, P) {
        const N = NH3H2O, f = (T) => { const [a, w] = N.yOf(x, T, P); return a + w - 1; };
        // scan down from 600 K (the top of the range; water has no saturation pressure above its critical point) to the first
        // crossing, then bisect: at low T and high P the gas terms (in 1/T^11) misbehave
        let hi = 600;
        if (!(f(hi) > 0)) throw new Error('nh3h2o(): no bubble temperature found below 600 K');
        while (hi > 225 && f(hi - 5) > 0) hi -= 5;
        if (hi <= 225) throw new Error(`nh3h2o(): at P = ${(P * 1e5).toPrecision(4)} Pa this liquid boils below 225 K, outside the formulation`);
        const T = N.bisect(f, hi - 5, hi, 60), [a, w] = N.yOf(x, T, P);
        return { T, x, y: a / (a + w) };
    }
    // liquid and vapor in equilibrium at T and P (mole fractions); null outside the two-phase range at this P
    static equilibrium(T, P) {
        const N = NH3H2O, f = (x) => { const [a, w] = N.yOf(x, T, P); return a + w - 1; };
        const lo = 1e-10, hi = 1 - 1e-10, flo = f(lo), fhi = f(hi);
        if ((flo < 0) === (fhi < 0)) return null;
        const x = N.bisect(f, lo, hi, 70), [a, w] = N.yOf(x, T, P);
        return { x, y: a / (a + w) };
    }
    // the state at T, P with overall ammonia mass fraction z: liquid, vapor, or both
    static stateTPz(T, P, z) {
        const N = NH3H2O, zm = N.mole(z);
        const Tb = N.bubble(zm, P).T;
        if (T <= Tb) return N.single('liquid', T, P, z);
        const Td = N.dewT(zm, P);
        if (T >= Td) return N.single('vapor', T, P, z);
        const eq = N.equilibrium(T, P), xl = N.mass(eq.x), yv = N.mass(eq.y);
        return N.mix(T, P, z, xl, yv, (z - xl) / (yv - xl));
    }
    static dewT(y, P) {   // dew temperature of vapor y (mole) at P: the equilibrium vapor gets leaner in ammonia as T rises
        const N = NH3H2O;
        // the two-phase window lies between the boiling points of pure ammonia and pure water (at very low P ammonia boils
        // below 230 K, the bottom of the range)
        let Ta = 230;
        try { Ta = N.bubble(1 - 1e-10, P).T; } catch (e) { if (!/boils below 225 K/.test(e.message)) throw e; }
        const Tw = N.bubble(1e-10, P).T;
        return N.bisect((T) => { const eq = N.equilibrium(T, P); return eq ? eq.y - y : (T < (Ta + Tw) / 2 ? 1 : -1); }, Math.max(Ta, 230) + 1e-9, Tw - 1e-9);
    }
    static single(kind, T, P, z) {
        const N = NH3H2O, p = N.phase(kind === 'liquid' ? N.GmL : N.GmG, N.mole(z), T, P);
        return { T, P, x: z, h: p.h, s: p.s, v: p.v, q: kind === 'liquid' ? -0.001 : 1.001, xl: z, yv: z };
    }
    static mix(T, P, z, xl, yv, q) {
        const N = NH3H2O, L = N.phase(N.GmL, N.mole(xl), T, P), V = N.phase(N.GmG, N.mole(yv), T, P);
        return { T, P, x: z, h: (1 - q) * L.h + q * V.h, s: (1 - q) * L.s + q * V.s, v: (1 - q) * L.v + q * V.v, q, xl, yv };
    }
    // state at P with overall z and vapor mass fraction q (0 bubble, 1 dew)
    static statePzq(P, z, q) {
        const N = NH3H2O, zm = N.mole(z);
        if (q === 0) { const b = N.bubble(zm, P); return N.mix(b.T, P, z, z, N.mass(b.y), 0); }
        const Tb = N.bubble(zm, P).T, Td = N.dewT(zm, P);
        if (q === 1) { const eq = N.equilibrium(Td, P); return N.mix(Td, P, z, eq ? N.mass(eq.x) : z, z, 1); }
        const qOf = (T) => { const eq = N.equilibrium(T, P); return eq ? (z - N.mass(eq.x)) / (N.mass(eq.y) - N.mass(eq.x)) - q : 0; };
        const T = N.bisect(qOf, Tb + 1e-9, Td - 1e-9), eq = N.equilibrium(T, P);
        return N.mix(T, P, z, N.mass(eq.x), N.mass(eq.y), q);
    }
    // nh3h2o('output', 'key1', v1, 'key2', v2, 'key3', v3), all SI: T [K], P [Pa], x (ammonia mass fraction), q (vapor mass
    // fraction; -0.001 for subcooled liquid and 1.001 for superheated vapor, as in EES), h [J/kg]. Inputs: T,P,x  P,x,q  T,x,q
    // T,P,q (q = 0 or 1: the liquid or the vapor in equilibrium)  P,x,h. Outputs: T P x h s u v q, and xl, yv (the ammonia mass
    // fractions of the liquid and the vapor; both equal x in one phase).
    static OUT = { t: 'T', p: 'P', x: 'x', h: 'h', s: 's', u: 'u', v: 'v', q: 'q', xl: 'xl', yv: 'yv' };
    static evaluate(a) {
        const N = NH3H2O, num = (v, k) => ThermoEngine.num(v, `nh3h2o() value for '${k}'`);
        if (a.length !== 7) throw new Error("nh3h2o(): use nh3h2o('output', 'key1', v1, 'key2', v2, 'key3', v3), keys T, P, x, q or h");
        const out = N.OUT[String(a[0]).trim().toLowerCase()];
        if (!out) throw new Error(`nh3h2o(): unknown output '${a[0]}'; use T, P, x, h, s, u, v, q, xl or yv`);
        const inp = {};
        for (let i = 1; i < 7; i += 2) {
            const k = String(a[i]).trim().toLowerCase();
            if (!['t', 'p', 'x', 'q', 'h'].includes(k)) throw new Error(`nh3h2o(): unknown input '${a[i]}'; the inputs are T, P, x, q and h`);
            if (k in inp) throw new Error(`nh3h2o(): input '${a[i]}' is given twice`);
            inp[k] = num(a[i + 1], a[i]);
        }
        const has = (...ks) => ks.every(k => k in inp);
        const P = 'p' in inp ? inp.p / 1e5 : null;   // bar
        if (P !== null && !(P >= 0.2 && P <= 110)) throw new Error(`nh3h2o(): P = ${inp.p} Pa is outside 0.2 to 110 bar, the range of the formulation`);
        if ('t' in inp && !(inp.t >= 230 && inp.t <= 600)) throw new Error(`nh3h2o(): T = ${inp.t} K is outside 230 to 600 K, the range of the formulation`);
        if ('x' in inp && !(inp.x >= 0 && inp.x <= 1)) throw new Error(`nh3h2o(): x = ${inp.x} must be an ammonia mass fraction from 0 to 1`);
        if ('q' in inp && !(inp.q >= 0 && inp.q <= 1)) throw new Error(`nh3h2o(): q = ${inp.q} must be a vapor mass fraction from 0 to 1 (a saturated or two-phase state)`);
        const z = 'x' in inp ? Math.min(Math.max(inp.x, 1e-9), 1 - 1e-9) : null;
        let st;
        if (has('t', 'p', 'x')) st = N.stateTPz(inp.t, P, z);
        else if (has('p', 'x', 'q')) st = N.statePzq(P, z, inp.q);
        else if (has('t', 'x', 'q')) {
            const f = (lp) => N.statePzq(Math.exp(lp), z, inp.q).T - inp.t;   // the saturation temperature rises with P
            if (f(Math.log(0.2)) > 0 || f(Math.log(110)) < 0) throw new Error(`nh3h2o(): no pressure between 0.2 and 110 bar gives this T, x and q`);
            st = N.statePzq(Math.exp(N.bisect(f, Math.log(0.2), Math.log(110), 60)), z, inp.q);
        } else if (has('t', 'p', 'q')) {
            if (inp.q !== 0 && inp.q !== 1) throw new Error('nh3h2o(): with T, P and q, q must be 0 (the saturated liquid) or 1 (the saturated vapor); give x as well for other states');
            const eq = N.equilibrium(inp.t, P);
            if (!eq) throw new Error(`nh3h2o(): at P = ${inp.p} Pa, T = ${inp.t} K is outside the two-phase range (between the boiling points of ammonia and water)`);
            const xl = N.mass(eq.x), yv = N.mass(eq.y);
            st = N.mix(inp.t, P, inp.q ? yv : xl, xl, yv, inp.q);
        } else if (has('p', 'x', 'h')) {
            const hk = inp.h / 1000, f = (T) => N.stateTPz(T, P, z).h - hk;   // h rises with T at constant P and x
            if (f(230) > 0 || f(600) < 0) throw new Error(`nh3h2o(): h = ${inp.h} J/kg at this P and x lies outside 230 to 600 K`);
            st = N.stateTPz(N.bisect(f, 230, 600, 60), P, z);
        } else throw new Error("nh3h2o(): the inputs must be T, P, x or P, x, q or T, x, q or T, P, q or P, x, h");
        const si = { T: st.T, P: st.P * 1e5, x: st.x, h: st.h * 1000, s: st.s * 1000, v: st.v, u: (st.h - st.P * 100 * st.v) * 1000, q: st.q, xl: st.xl, yv: st.yv };
        return si[out];
    }
}

// U.S. Standard Atmosphere, 1976 (NOAA, NASA, USAF), from -5 to 86 km geometric altitude: the seven layers of linear
// molecular-scale temperature in geopotential altitude (Table 4), the hydrostatic equation for P (Eqs. 33a, 33b), and above
// 80 km the ratio M/M0 of Table 8 for the kinetic temperature (Eq. 22). Viscosity (Eq. 51), thermal conductivity (Eq. 53),
// speed of sound (Eq. 50), gravity (Eq. 17), with the constants of the standard (R* = 8.31432 J/(mol K), M0 = 28.9644 g/mol).
class StdAtmosphere {
    static G0 = 9.80665; static RS = 8.31432; static M0 = 0.0289644; static R0 = 6356766; static GAMMA = 1.4;
    static HB = [0, 11000, 20000, 32000, 47000, 51000, 71000, 84852];
    static LB = [-0.0065, 0, 0.001, 0.0028, 0, -0.0028, -0.002];
    static MZ = [1, 0.999996, 0.999989, 0.999971, 0.999941, 0.999909, 0.999870, 0.999829, 0.999786, 0.999741, 0.999694, 0.999641, 0.999579];   // 80 to 86 km by 0.5 km
    static base = (() => {   // T_M and P at the layer bases
        const A = StdAtmosphere, T = [288.15], P = [101325], k = A.G0 * A.M0 / A.RS;
        for (let i = 0; i < 7; i++) {
            const dH = A.HB[i + 1] - A.HB[i], L = A.LB[i];
            T.push(T[i] + L * dH);
            P.push(L === 0 ? P[i] * Math.exp(-k * dH / T[i]) : P[i] * Math.pow(T[i] / T[i + 1], k / L));
        }
        return { T, P };
    })();
    static OUT = { t: 1, p: 1, rho: 1, c: 1, mu: 1, k: 1, nu: 1, g: 1, h: 1 };
    static state(z) {
        const A = StdAtmosphere;
        if (!(z >= -5000 - 1e-9 && z <= 86000 + 1e-9)) throw new Error(`atmosphere(): z = ${z} m is outside the standard atmosphere, -5000 to 86000 m (geometric altitude)`);
        const H = A.R0 * z / (A.R0 + z), k = A.G0 * A.M0 / A.RS;
        let i = 0; while (i < 6 && H >= A.HB[i + 1]) i++;
        const Tb = A.base.T[i], Pb = A.base.P[i], L = A.LB[i], dH = H - A.HB[i], TM = Tb + L * dH;
        const P = L === 0 ? Pb * Math.exp(-k * dH / Tb) : Pb * Math.pow(Tb / TM, k / L);
        let ratio = 1;
        if (z > 80000) { const x = (z - 80000) / 500, j = Math.min(Math.floor(x), 11); ratio = A.MZ[j] + (x - j) * (A.MZ[j + 1] - A.MZ[j]); }
        const T = TM * ratio, rho = P * A.M0 / (A.RS * TM), mu = 1.458e-6 * T ** 1.5 / (T + 110.4);
        return { t: T, p: P, rho, c: Math.sqrt(A.GAMMA * A.RS * TM / A.M0), mu, k: 2.64638e-3 * T ** 1.5 / (T + 245.4 * 10 ** (-12 / T)), nu: mu / rho,
            g: A.G0 * (A.R0 / (A.R0 + z)) ** 2, h: H };
    }
    static evaluate(name, a) {
        const A = StdAtmosphere, key = (s) => String(s).trim().toLowerCase();
        const list = "'T', 'P', 'rho', 'c', 'mu', 'k', 'nu', 'g', 'H'";
        if (name === 'atmosphere') {
            if (a.length !== 2) throw new Error("atmosphere(): use atmosphere('output', z), z the geometric altitude in m");
            const o = key(a[0]); if (!(o in A.OUT)) throw new Error(`atmosphere(): '${a[0]}' should be one of ${list}`);
            return A.state(ThermoEngine.num(a[1], 'atmosphere() altitude'))[o];
        }
        if (a.length !== 2) throw new Error("atmosphere_altitude(): use atmosphere_altitude('P', value) or atmosphere_altitude('rho', value)");
        const o = key(a[0]), v = ThermoEngine.num(a[1], 'atmosphere_altitude() value');
        if (o !== 'p' && o !== 'rho') throw new Error(`atmosphere_altitude(): the altitude can be found from 'P' or 'rho' (they fall steadily with altitude), not from '${a[0]}'`);
        const f = (z) => A.state(z)[o], lo0 = f(86000), hi0 = f(-5000);
        if (!(v >= lo0 && v <= hi0)) throw new Error(`atmosphere_altitude(): ${o === 'p' ? 'P' : 'rho'} = ${v} is outside the standard atmosphere, ${+lo0.toPrecision(5)} to ${+hi0.toPrecision(5)} ${o === 'p' ? 'Pa' : 'kg/m^3'}`);
        let lo = -5000, hi = 86000;
        for (let it = 0; it < 200 && hi - lo > 1e-9; it++) { const m = (lo + hi) / 2; if (f(m) > v) lo = m; else hi = m; }
        return (lo + hi) / 2;
    }
}

// Seawater at atmospheric pressure, and pressure and depth in the ocean.
// seawater('output', T, S): T 273.15 to 393.15 K, S the absolute salinity in kg/kg (0 to 0.12), from the correlations of
// M. H. Sharqawy, J. H. Lienhard V and S. M. Zubair, Desalination and Water Treatment 16 (2010) 354-380. Density, cp and k
// through CoolProp's fit of them (INCOMP::MITSW, within 0.06 % of the MIT seawater property tables); the viscosity straight
// from the paper's correlation (CoolProp's fit of it is up to 0.8 % off), mu_w(t) (1 + A S + B S^2), t in degC. These are
// correlations at atmospheric pressure (at the vapor pressure above 100 degC) and do not depend on pressure; CoolProp is called
// at 1 MPa, above the vapor pressure up to 120 degC, since it refuses a pressure below it. The boiling-point elevation is the
// paper's correlation, BPE = A S^2 + B S with S in g/kg and A, B quadratic in t (degC).
// oceandepth(P, lat) and oceanpressure(z, lat): N. P. Fofonoff and R. C. Millard, Algorithms for computation of fundamental
// properties of seawater, UNESCO Technical Papers in Marine Science 44, 1983 (after Saunders and Fofonoff 1976): the depth of
// the standard ocean (0 degC, S = 35) from the sea pressure p = P - 101325 Pa, in dbar; check value 9712.653 m at 10000 dbar,
// 30 deg. lat in radians. oceanpressure inverts it by bisection.
class Seawater {
    static OUT = { rho: 1, cp: 1, k: 1, mu: 1, nu: 1, alpha: 1, pr: 1, bpe: 1 };
    static TEOS = { h: 1, s: 1, g: 1, muw: 1, aw: 1, phi: 1, pi: 1 };   // from the TEOS-10 Gibbs function, at any pressure
    // Saline part of the TEOS-10 Gibbs function, IAPWS R13-08 Eq. (4) with the 64 coefficients of its Table 2 (Feistel 2008):
    // g^S/g* = (g100 + g110 tau) xi^2 ln xi + sum of g_ijk xi^i tau^j pi^k, xi = sqrt(S_A/S*) with S* = S_n 40/35, tau = t/40 K,
    // pi = (p - p0)/1e8 Pa. Verified against the release's check values and the TEOS-10 GSW-C library.
    // Rows [i, j, k, g_ijk] for i >= 2; G100 and G110 are the two terms of the ideal-solution logarithm.
    static G100 = 5812.81456626732; static G110 = 851.226734946706;
    static GIJK = [
        [2, 0, 0, 1416.27648484197], [2, 0, 1, -3310.49154044839], [2, 0, 2, 384.794152978599],
        [2, 0, 3, -96.5324320107458], [2, 0, 4, 15.8408172766824], [2, 0, 5, -2.62480156590992],
        [2, 1, 0, 168.072408311545], [2, 1, 1, 729.116529735046], [2, 1, 2, -343.956902961561],
        [2, 1, 3, 124.687671116248], [2, 1, 4, -31.656964386073], [2, 1, 5, 7.04658803315449],
        [2, 2, 0, 880.031352997204], [2, 2, 1, -860.764303783977], [2, 2, 2, 337.409530269367],
        [2, 2, 3, -178.314556207638], [2, 2, 4, 44.2040358308], [2, 2, 5, -7.92001547211682],
        [2, 3, 0, -225.267649263401], [2, 3, 1, 694.244814133268], [2, 3, 2, -204.889641964903],
        [2, 3, 3, 113.561697840594], [2, 3, 4, -11.1282734326413], [2, 4, 0, 91.4260447751259],
        [2, 4, 1, -297.728741987187], [2, 4, 2, 74.726141138756], [2, 4, 3, -36.4872919001588],
        [2, 5, 0, -21.6603240875311], [2, 6, 0, 2.13016970847183], [3, 0, 0, -2432.14662381794],
        [3, 0, 1, 199.459603073901], [3, 0, 2, -52.2940909281335], [3, 0, 3, 68.0444942726459],
        [3, 0, 4, -3.41251932441282], [3, 1, 0, -493.407510141682], [3, 1, 1, -175.292041186547],
        [3, 1, 2, 83.1923927801819], [3, 1, 3, -29.483064349429], [3, 2, 0, -43.0664675978042],
        [3, 2, 1, 383.058066002476], [3, 2, 2, -54.1917262517112], [3, 2, 3, 25.6398487389914],
        [3, 3, 0, -10.0227370861875], [3, 3, 1, -460.319931801257], [3, 4, 0, 0.875600661808945],
        [3, 4, 1, 234.565187611355], [4, 0, 0, 2025.80115603697], [4, 0, 1, -54.7919133532887],
        [4, 0, 2, -4.08193978912261], [4, 0, 3, -30.1755111971161], [4, 1, 0, 543.835333000098],
        [4, 1, 1, -22.6683558512829], [4, 2, 0, -68.5572509204491], [4, 3, 0, 49.3667694856254],
        [4, 4, 0, -17.1397577419788], [4, 5, 0, 2.49697009569508], [5, 0, 0, -1091.66841042967],
        [5, 0, 1, 36.0284195611086], [5, 1, 0, -196.028306689776], [6, 0, 0, 374.60123787784],
        [6, 1, 0, 36.7571622995805], [7, 0, 0, -48.5891069025409]];
    // d = '000' (g^S, J/kg), '100' (dg/dS_A, J/kg per g/kg), '010' (dg/dt, J/(kg K)), '001' (dg/dp, m^3/kg).
    // S_A in g/kg, t in degC, p the sea pressure in dbar (absolute pressure - 101325 Pa, in units of 1e4 Pa).
    static gS(d, sa, t, p) {
        const SU = 35.16504 * 40 / 35, xi2 = sa / SU, xi = Math.sqrt(xi2), tau = t / 40, pi = p * 1e-4, L = Seawater.G100 + Seawater.G110 * tau;
        let v = 0;
        if (d === '000') { for (const [i, j, k, c] of Seawater.GIJK) v += c * xi ** i * tau ** j * pi ** k; return sa > 0 ? v + L * xi2 * Math.log(xi) : v; }
        if (d === '010') { for (const [i, j, k, c] of Seawater.GIJK) if (j) v += c * xi ** i * j * tau ** (j - 1) * pi ** k; return (sa > 0 ? v + Seawater.G110 * xi2 * Math.log(xi) : v) / 40; }
        if (d === '001') { for (const [i, j, k, c] of Seawater.GIJK) if (k) v += c * xi ** i * tau ** j * k * pi ** (k - 1); return v * 1e-8; }
        if (d === '100') {   // d/dS_A = (d xi/dS_A) d/d xi, d xi/dS_A = 1/(2 xi S*); at S_A = 0 the logarithm makes it infinite, and 0 is returned
            if (!(sa > 0)) return 0;
            for (const [i, j, k, c] of Seawater.GIJK) v += c * i * xi ** (i - 1) * tau ** j * pi ** k;
            return (v + L * (2 * xi * Math.log(xi) + xi)) / (2 * xi * SU);
        }
        throw new Error('Seawater.gS: derivative ' + d);
    }
    // Seawater of Reference Composition by TEOS-10: g = g_W(T, P) + g^S(S_A, T, P), with g_W from IAPWS-95 (CoolProp,
    // the water part IAPWS R13-08 is built on) and g^S above. S in kg/kg, T in K, P absolute in Pa. Outputs: h, s, g (per kg
    // of seawater), muw (chemical potential of water, J/kg of water), aw (water activity), phi (osmotic coefficient), and
    // pi (osmotic pressure: pure water at P balances seawater at P + pi). IAPWS R13-08, sections 4 and 5.
    static R = 8.314472; static MS = 0.0314038218; static MW = 0.018015268;   // J/(mol K), kg/mol (R13-08; MW from IAPWS-95)
    static teos(o, T, S, P) {
        const t = T - 273.15;
        if (!(T >= 273.15 - 1e-9 && T <= 353.15 + 1e-9)) throw new Error(`seawater('${o}'): T = ${T} K is outside the TEOS-10 seawater range used here, 273.15 to 353.15 K (0 to 80 degC)`);
        if (!(S >= 0 && S <= 0.12)) throw new Error(`seawater('${o}'): S = ${S} is outside 0 to 0.12 kg/kg (0 to 120 g/kg); give the salinity in kg/kg, e.g. 0.035`);
        const Pmax = S <= 0.042 ? 1e8 : 1.2e7;
        if (!(P >= 1e4 && P <= Pmax)) throw new Error(`seawater('${o}'): P = ${P} Pa is outside 1e4 to ${Pmax} Pa (${S <= 0.042 ? '100 MPa' : '12 MPa above 42 g/kg'}); P is the absolute pressure`);
        const CP = ThermoEngine.CP, W = (k, p) => { const v = CP.PropsSI(k, 'T', T, 'P', p, 'Water'); if (!Number.isFinite(v)) ThermoEngine.fail(CP, `water ${k} at T = ${T} K, P = ${p} Pa`); return v; };
        const SA = S * 1000, sea = (p) => (p - 101325) / 1e4, G = Seawater.gS;
        const muS = (p) => G('000', SA, t, sea(p)) - SA * G('100', SA, t, sea(p));   // saline part of the chemical potential of water
        if (o === 'h') return W('Hmass', P) + G('000', SA, t, sea(P)) - T * G('010', SA, t, sea(P));
        if (o === 's') return W('Smass', P) - G('010', SA, t, sea(P));
        if (o === 'g') return W('Gmass', P) + G('000', SA, t, sea(P));
        if (o === 'muw') return W('Gmass', P) + muS(P);
        if (o === 'aw') return Math.exp(muS(P) * Seawater.MW / (Seawater.R * T));
        if (o === 'phi') return S === 0 ? 1 : -muS(P) * (1 - S) * Seawater.MS / (S * Seawater.R * T);   // m = S/((1 - S) MS)
        if (o === 'pi') {   // g_W(T, P) = g_W(T, P + pi) + muS(P + pi)
            if (S === 0) return 0;
            const gw = W('Gmass', P), f = (x) => W('Gmass', P + x) + muS(P + x) - gw;
            let x = -muS(P) * W('Dmass', P), fx;   // first guess: pi = -muS rho_w
            for (let it = 0; it < 50; it++) {
                fx = f(x);
                const d = 1 / W('Dmass', P + x) + G('001', SA, t, sea(P + x)) - SA * Seawater.gSP(SA, t, sea(P + x));
                const dx = fx / d; x -= dx;
                if (Math.abs(dx) < 1e-9 * Math.max(x, 1)) break;
            }
            return x;
        }
        throw new Error(`seawater(): no output '${o}'`);
    }
    static gSP(sa, t, p) {   // d2g^S/(dS_A dp), by a central difference in p (only for the Newton step of pi)
        const h = 1; return (Seawater.gS('100', sa, t, p + h) - Seawater.gS('100', sa, t, p - h)) / (2 * h * 1e4);
    }
    static bpe(T, S) {
        const t = T - 273.15, s = S * 1000, A = (-4.584e-4 * t * t + 2.823e-1 * t + 17.95) * 1e-6, B = (1.536e-4 * t * t + 5.267e-2 * t + 6.56) * 1e-3;
        return A * s * s + B * s;
    }
    static mu(T, S) {
        const t = T - 273.15, A = 1.541 + 1.998e-2 * t - 9.52e-5 * t * t, B = 7.974 - 7.561e-2 * t + 4.724e-4 * t * t;
        return (4.2844e-5 + 1 / (0.157 * (t + 64.993) ** 2 - 91.296)) * (1 + A * S + B * S * S);
    }
    static props(T, S) {
        if (!(T >= 273.15 - 1e-9 && T <= 393.15 + 1e-9)) throw new Error(`seawater(): T = ${T} K is outside the correlations, 273.15 to 393.15 K (0 to 120 degC)`);
        if (!(S >= 0 && S <= 0.12)) throw new Error(`seawater(): S = ${S} is outside the correlations, 0 to 0.12 kg/kg (0 to 120 g/kg); give the salinity in kg/kg, e.g. 0.035`);
        const CP = ThermoEngine.CP, f = `INCOMP::MITSW[${S}]`, T1 = Math.min(Math.max(T, 273.15), 393.15);
        const get = (k) => { const v = CP.PropsSI(k, 'T', T1, 'P', 1e6, f); if (!Number.isFinite(v)) ThermoEngine.fail(CP, `seawater ${k} at T = ${T} K, S = ${S}`); return v; };
        const rho = get('D'), cp = get('C'), k = get('L'), mu = Seawater.mu(T1, S);
        return { rho, cp, k, mu, nu: mu / rho, alpha: k / (rho * cp), pr: mu * cp / k, bpe: Seawater.bpe(T1, S) };
    }
    static depth(P, lat) {   // P absolute, Pa
        const p = (P - 101325) / 1e4, x = Math.sin(lat) ** 2;
        const g = 9.780318 * (1 + (5.2788e-3 + 2.36e-5 * x) * x) + 1.092e-6 * p;
        return (((-1.82e-15 * p + 2.279e-10) * p - 2.2512e-5) * p + 9.72659) * p / g;
    }
    static evaluate(name, a) {
        const S = Seawater, num = ThermoEngine.num;
        if (name === 'seawater') {
            const o = String(a[0]).trim().toLowerCase();
            if (o in S.TEOS) {
                if (a.length !== 3 && a.length !== 4) throw new Error(`seawater(): use seawater('${a[0]}', T, S) or seawater('${a[0]}', T, S, P), T in K, S in kg/kg and P the absolute pressure in Pa (101325 Pa if left out)`);
                return S.teos(o, num(a[1], 'seawater() T'), num(a[2], 'seawater() S'), a.length === 4 ? num(a[3], 'seawater() P') : 101325);
            }
            if (a.length !== 3) throw new Error(`seawater(): use seawater('${a[0]}', T, S), T in K and S the salinity in kg/kg${a.length === 4 ? "; a pressure is taken only by 'h', 's', 'g', 'muw', 'aw', 'phi' and 'Pi'" : ''}`);
            if (!(o in S.OUT)) throw new Error(`seawater(): '${a[0]}' should be one of 'rho', 'cp', 'k', 'mu', 'nu', 'alpha', 'Pr', 'BPE', 'h', 's', 'g', 'muw', 'aw', 'phi', 'Pi'`);
            return S.props(num(a[1], 'seawater() T'), num(a[2], 'seawater() S'))[o];
        }
        if (a.length !== 2) throw new Error(`${name}(): use ${name === 'oceandepth' ? 'oceandepth(P, lat), P the absolute pressure in Pa' : 'oceanpressure(z, lat), z the depth in m'} and lat the latitude in radians (tag it [deg])`);
        const v = num(a[0], `${name}() ${name === 'oceandepth' ? 'P' : 'z'}`), lat = num(a[1], `${name}() latitude`);
        if (!(Math.abs(lat) <= Math.PI / 2 + 1e-12)) throw new Error(`${name}(): latitude ${lat} rad is not between -pi/2 and pi/2; give it in degrees with a unit tag, lat = 30 [deg]`);
        const Pmax = 101325 + 1e8, zmax = S.depth(Pmax, lat);
        if (name === 'oceandepth') {
            if (!(v >= 101325 - 1e-6 && v <= Pmax)) throw new Error(`oceandepth(): P = ${v} Pa is outside 101325 Pa (the surface) to ${Pmax} Pa (10000 dbar of sea pressure); P is the absolute pressure`);
            return S.depth(v, lat);
        }
        if (!(v >= -1e-9 && v <= zmax)) throw new Error(`oceanpressure(): z = ${v} m is outside 0 to ${+zmax.toPrecision(6)} m (10000 dbar of sea pressure at this latitude); z is the depth, positive down`);
        let lo = 101325, hi = Pmax;
        for (let it = 0; it < 200 && hi - lo > 1e-7; it++) { const m = (lo + hi) / 2; if (S.depth(m, lat) < v) lo = m; else hi = m; }
        return (lo + hi) / 2;
    }
}

// Mixtures of CoolProp's pure fluids, by mole fraction. Both functions take the keys of nh3h2o(): T, P, x (the overall mole
// fraction of the first fluid named, or an array of all of them), q (the molar vapor fraction; -0.001 for subcooled liquid and
// 1.001 for superheated vapor) and h; h, s, u and v are per kg.
// idealmixture(): an ideal liquid solution in equilibrium with an ideal-gas vapor, Raoult's law  y_i P = x_i Psat_i(T), for any
// number of fluids. The liquid: the pure saturated liquids at T (the effect of pressure neglected) with the ideal entropy of
// mixing; the vapor: the pure gases at their partial pressures y_i P (CoolProp), so pure-fluid limits are exact.
// mixture(): CoolProp's multi-fluid equation of state (the form of GERG-2008, with the parameters CoolProp has for each pair),
// only for fluids whose every pair has them. The phase equilibrium is solved here, from the fugacity coefficients of each
// phase: CoolProp's own mixture flash finds the state but cannot return the compositions of the phases in this build.
// Both share one solver: K_i = y_i/x_i is Psat_i/P (ideal) or phi_i(liquid)/phi_i(vapor) (real), the Rachford-Rice equation
//     sum z_i (K_i - 1)/(1 + q (K_i - 1)) = 0
// (q = 0 at the bubble point, q = 1 at the dew point) is solved for the unknown of the state, with the compositions of the
// phases updated by successive substitution, to 1e-9 in ln K (CoolProp's fugacity coefficients scatter by about 1e-10). The real model starts from Wilson's K-values, K_i = (Pc_i/P) exp(5.373 (1 + w_i)
// (1 - Tc_i/T)). CoolProp's exceptions leak memory in this build, so the fluids of each mixture are checked once and cached.
class Mixtures {
    static R = 8.314462618;
    static cache = new Map();    // the fluids of each mixture named
    static states = new Map();   // the last 500 states computed (the solver asks for several outputs of the same state)
    static info(spec, fn) {
        const key = String(spec).trim();
        if (Mixtures.cache.has(key)) return Mixtures.cache.get(key);
        const CP = ThermoEngine.CP, parts = key.split('&').map(s => s.trim());
        if (parts.length < 2 || parts.some(p => !p)) throw new Error(`${fn}(): name the fluids joined by &, as 'ethanol&water'`);
        const names = parts.map(p => {
            let n = '';
            try { n = CP.get_fluid_param_string(p, 'name'); } catch (e) { }
            if (!n) throw new Error(`${fn}(): '${p}' is not a CoolProp fluid (see Supported substances)`);
            if (CP.get_fluid_param_string(n, 'pure') !== 'true') throw new Error(`${fn}(): '${p}' is itself a mixture; name pure fluids`);
            return n;
        });
        if (new Set(names).size < names.length) throw new Error(`${fn}(): a fluid is named twice in '${key}'`);
        const one = (k) => names.map(n => CP.Props1SI(n, k));
        const c = { key, names, n: names.length, M: one('M'), Tc: one('Tcrit'), Pc: one('pcrit'), w: one('acentric'), Tmin: one('Tmin'), fitted: null, AS: null, vec: null };
        Mixtures.cache.set(key, c);
        return c;
    }
    // The real model: every pair must have its parameters in CoolProp (checked once)
    static real(c, fn) {
        const CP = ThermoEngine.CP;
        if (c.fitted === null) {
            const cas = c.names.map(n => CP.get_fluid_param_string(n, 'CAS'));
            c.fitted = '';
            for (let i = 0; i < c.n && !c.fitted; i++) for (let j = i + 1; j < c.n && !c.fitted; j++) {
                let ok = false;
                for (const [a, b] of [[cas[i], cas[j]], [cas[j], cas[i]]]) { try { CP.get_mixture_binary_pair_data(a, b, 'betaT'); ok = true; break; } catch (e) { } }
                if (!ok) c.fitted = `${c.names[i]} and ${c.names[j]}`;
            }
            if (!c.fitted) { c.AS = CP.factory('HEOS', c.names.join('&')); c.vec = new CP.VectorDouble(); c.names.forEach(() => c.vec.push_back(0)); }
        }
        if (c.fitted) throw new Error(`${fn}(): CoolProp has no parameters for the pair ${c.fitted}; idealmixture() (Raoult's law) works for any fluids`);
        return c;
    }
    // One phase of the real model at T, P and composition: ln phi_i, and h, s (molar) and v (m^3/mol)
    static phaseReal(c, comp, T, P, liquid, fn) {
        const CP = ThermoEngine.CP, AS = c.AS;
        comp.forEach((v, i) => c.vec.set(i, v));
        try {
            AS.set_mole_fractions(c.vec);
            AS.specify_phase(liquid ? CP.phases.iphase_liquid : CP.phases.iphase_gas);
            AS.update(CP.input_pairs.PT_INPUTS, P, T);
            const lnphi = comp.map((v, i) => Math.log(AS.fugacity_coefficient(i)));
            const r = { lnphi, h: AS.hmolar(), s: AS.smolar(), v: 1 / AS.rhomolar() };
            if (![...lnphi, r.h, r.s, r.v].every(Number.isFinite)) throw new Error('not finite');
            return r;
        } catch (e) {
            throw new Error(`${fn}(): CoolProp could not evaluate the ${liquid ? 'liquid' : 'vapor'} of ${c.key} at T = ${+T.toPrecision(6)} K, P = ${+P.toPrecision(6)} Pa (near or above the critical region of the mixture?)`);
        } finally { try { AS.unspecify_phase(); } catch (e) { } }
    }
    static psat(c, i, T, fn) {
        if (!(T >= c.Tmin[i] && T <= c.Tc[i])) throw new Error(`${fn}(): Raoult's law needs the vapor pressure of ${c.names[i]}, known from ${+c.Tmin[i].toPrecision(6)} K to its critical temperature, ${+c.Tc[i].toPrecision(6)} K; T = ${+T.toPrecision(6)} K`);
        return ThermoEngine.CP.PropsSI('P', 'T', T, 'Q', 0, c.names[i]);
    }
    // ln K_i at T, P for liquid x and vapor y
    static lnK(m, T, P, x, y) {
        const c = m.c;
        if (!m.real) { const g = m.gamma ? Mixtures.lnGamma(m.gamma, x, m.fn) : null; return c.names.map((n, i) => Math.log(Mixtures.psat(c, i, T, m.fn) / P) + (g ? g[i] : 0)); }
        const L = Mixtures.phaseReal(c, x, T, P, true, m.fn), V = Mixtures.phaseReal(c, y, T, P, false, m.fn);
        return L.lnphi.map((l, i) => l - V.lnphi[i]);
    }
    static wilson(c, T, P) { return c.names.map((n, i) => Math.log(c.Pc[i] / P) + 5.373 * (1 + c.w[i]) * (1 - c.Tc[i] / T)); }
    static norm(a) { const s = a.reduce((p, v) => p + v, 0); return a.map(v => v / s); }
    // The compositions of the phases and the Rachford-Rice residual at T, P for overall z and vapor fraction q, with the
    // compositions converged by successive substitution from lnK0
    static split(m, T, P, z, q, lnK0) {
        let lnK = lnK0 || (m.real ? Mixtures.wilson(m.c, T, P) : Mixtures.lnK(m, T, P, z, z)), x, y;
        for (let it = 0; it < 300; it++) {
            const K = lnK.map(Math.exp);
            x = Mixtures.norm(z.map((v, i) => v / (1 + q * (K[i] - 1))));
            y = Mixtures.norm(x.map((v, i) => v * K[i]));
            if (m.ideal) break;
            const next = Mixtures.lnK(m, T, P, x, y), d = Math.max(...next.map((v, i) => Math.abs(v - lnK[i])));
            lnK = next;
            if (d < 1e-9) break;
        }
        const K = lnK.map(Math.exp);
        return { x, y, lnK, g: z.reduce((s, v, i) => s + v * (K[i] - 1) / (1 + q * (K[i] - 1)), 0) };
    }
    // A root of f between a and b, where f changes sign (the Illinois method)
    static bracketed(f, a, b, fa, fb, ftol = 0) {
        let side = 0;
        for (let it = 0; it < 300; it++) {
            const c = (a * fb - b * fa) / (fb - fa), fc = f(c);
            if (Math.abs(fc) <= ftol || Math.abs(b - a) <= 1e-14 * Math.max(1, Math.abs(c))) return c;
            if (fc * fb < 0) { a = b; fa = fb; side = 0; } else { fa = side === -1 ? fa / 2 : fa; side = -1; }
            b = c; fb = fc;
        }
        return b;
    }
    // A root of f near u0: steps of growing size on both sides until f changes sign, within lo to hi
    static root(f, u0, step, lo, hi, what) {
        const clip = (u) => Math.min(Math.max(u, lo), hi), a0 = clip(u0), f0 = f(a0);
        if (f0 === 0) return a0;
        const prev = { 1: [a0, f0], '-1': [a0, f0] };
        for (let k = 0, s = step; k < 60; k++, s *= 1.6) {
            for (const d of [1, -1]) {
                const c = clip(a0 + d * s);
                if (c === prev[d][0]) continue;
                let fc; try { fc = f(c); } catch (e) { continue; }
                if (!Number.isFinite(fc)) continue;
                if (fc === 0) return c;
                if (fc * f0 < 0) return Mixtures.bracketed(f, prev[d][0], c, prev[d][1], fc);
                prev[d] = [c, fc];
            }
            if (clip(a0 + s) === hi && clip(a0 - s) === lo) break;
        }
        throw new Error(what);
    }
    // The Rachford-Rice residual with Wilson's K-values: a first estimate of a saturation state for the real model
    static rrWilson(c, T, P, z, q) {
        const K = Mixtures.wilson(c, T, P).map(Math.exp);
        return z.reduce((s, v, i) => s + v * (K[i] - 1) / (1 + q * (K[i] - 1)), 0);
    }
    // The real model at the bubble (q = 0) or dew point (q = 1): the pressure at T (solveT false) or the temperature at P, with
    // the composition w of the incipient phase updated at each step, as usual: S = sum z K (bubble) or sum z/K (dew) must be 1;
    // P is multiplied (bubble) or divided (dew) by S, since K goes as 1/P; 1/T takes a secant step on ln S, the first with the
    // slope of Wilson's K-values
    static satReal(m, z, q, T, P, solveT) {
        const c = m.c, what = `${m.fn}(): no ${q === 0 ? 'bubble' : 'dew'} ${solveT ? 'temperature' : 'pressure'} found for ${c.key} at ${solveT ? `P = ${+P.toPrecision(6)} Pa` : `T = ${+T.toPrecision(6)} K`}`;
        if (m.gamma) {   // activity coefficients: start from Raoult's law
            const ideal = { ...m, ideal: true, gamma: null }, s0 = solveT ? Mixtures.satT(ideal, P, z, q) : Mixtures.satP(ideal, T, z, q);
            if (solveT) T = s0.T; else P = s0.P;
        } else if (solveT) { try { T = Mixtures.root((t) => Mixtures.rrWilson(c, t, P, z, q), 300, 20, 30, 3000, ''); } catch (e) { T = 300; } }
        else { try { P = Math.exp(Mixtures.root((u) => Mixtures.rrWilson(c, T, Math.exp(u), z, q), Math.log(1e5), 1, Math.log(1e-2), Math.log(1e9), '')); } catch (e) { P = 1e5; } }
        let lnK = m.gamma ? Mixtures.lnK(m, T, P, z, z) : Mixtures.wilson(c, T, P), prev = null, w = z;
        const dW = c.names.map((n, i) => -5.373 * (1 + c.w[i]) * c.Tc[i]);   // d ln K / d(1/T), Wilson
        for (let it = 0; it < 300; it++) {
            const K = lnK.map(Math.exp), terms = z.map((v, i) => q === 0 ? v * K[i] : v / K[i]), S = terms.reduce((a, b) => a + b, 0);
            w = terms.map(v => v / S);
            const F = Math.log(S);
            if (!Number.isFinite(F)) throw new Error(what);
            if (solveT) {
                let slope = (q === 0 ? 1 : -1) * w.reduce((a, v, i) => a + v * dW[i], 0);
                if (prev && Math.abs(1 / T - prev.iT) > 1e-15 && (F - prev.F) * slope > 0) slope = (F - prev.F) / (1 / T - prev.iT);
                prev = { iT: 1 / T, F };
                let Tn = 1 / (1 / T - F / slope);
                if (!(Tn > 0)) Tn = T * 1.1;
                T = Math.min(Math.max(Tn, T - 20, 30), T + 20, 3000);
            } else P = q === 0 ? P * S : P / S;
            let next;
            try { next = Mixtures.lnK(m, T, P, q === 0 ? z : w, q === 0 ? w : z); } catch (e) { if (it === 0) throw e; throw new Error(what); }
            const d = Math.max(...next.map((v, i) => Math.abs(v - lnK[i])));
            lnK = next;
            if (Math.abs(F) < 1e-9 && d < 1e-9) break;
            if (it === 299) throw new Error(what);
        }
        if (Math.max(...lnK.map(Math.abs)) < 1e-4) throw new Error(`${m.fn}(): ${c.key} is at or near its critical point here; the phases cannot be told apart`);
        return { T, P, x: q === 0 ? z : w, y: q === 0 ? w : z, lnK };
    }
    // Saturation (0 <= q <= 1, z fixed): the temperature at P, or the pressure at T
    static satT(m, P, z, q) {
        if (!m.ideal && (q === 0 || q === 1)) return Mixtures.satReal(m, z, q, null, P, true);
        const c = m.c, what = `${m.fn}(): no ${q === 0 ? 'bubble' : q === 1 ? 'dew' : 'saturation'} temperature found for ${c.key} at P = ${+P.toPrecision(6)} Pa`;
        if (m.ideal) {
            const lo = Math.max(...c.Tmin), hi = Math.min(...c.Tc) * (1 - 1e-9), f = (T) => Mixtures.split(m, T, P, z, q).g, flo = f(lo), fhi = f(hi);
            if (!(flo * fhi < 0)) throw new Error(`${what} between ${+lo.toPrecision(6)} and ${+hi.toPrecision(6)} K, where the vapor pressures of all the fluids are known`);
            const T = Mixtures.bracketed(f, lo, hi, flo, fhi);
            return { T, ...Mixtures.split(m, T, P, z, q) };
        }
        let T0 = 300;
        try { T0 = Mixtures.root((T) => Mixtures.rrWilson(c, T, P, z, q), 300, 20, 30, 3000, ''); } catch (e) { }
        let last = null;
        const g = (T) => { const s = Mixtures.split(m, T, P, z, q, last); last = s.lnK; return s.g; };
        const T = Mixtures.root(g, T0, 2, 30, 3000, what);
        return { T, ...Mixtures.split(m, T, P, z, q, last) };
    }
    static satP(m, T, z, q) {
        if (!m.ideal && (q === 0 || q === 1)) return Mixtures.satReal(m, z, q, T, null, false);
        const c = m.c, what = `${m.fn}(): no ${q === 0 ? 'bubble' : q === 1 ? 'dew' : 'saturation'} pressure found for ${c.key} at T = ${+T.toPrecision(6)} K`;
        if (m.ideal) {   // K = Psat/P: the bubble and dew pressures are explicit; between them, the Rachford-Rice residual in ln P
            const ps = c.names.map((n, i) => Mixtures.psat(c, i, T, m.fn));
            const Pb = z.reduce((s, v, i) => s + v * ps[i], 0), Pd = 1 / z.reduce((s, v, i) => s + v / ps[i], 0);
            let P = q === 0 ? Pb : q === 1 ? Pd : null;
            if (P === null) { const f = (u) => Mixtures.split(m, T, Math.exp(u), z, q).g, a = Math.log(Pd), b = Math.log(Pb); P = Math.exp(Mixtures.bracketed(f, a, b, f(a), f(b))); }
            return { P, ...Mixtures.split(m, T, P, z, q) };
        }
        let u0 = Math.log(1e5);
        try { u0 = Mixtures.root((u) => Mixtures.rrWilson(c, T, Math.exp(u), z, q), Math.log(1e5), 1, Math.log(1e-2), Math.log(1e9), ''); } catch (e) { }
        let last = null;
        const g = (u) => { const s = Mixtures.split(m, T, Math.exp(u), z, q, last); last = s.lnK; return s.g; };
        const P = Math.exp(Mixtures.root(g, u0, 0.2, Math.log(1e-2), Math.log(1e9), what));
        return { P, ...Mixtures.split(m, T, P, z, q, last) };
    }
    // Properties of a phase (molar)
    static phase(m, comp, T, P, liquid) {
        const c = m.c, CP = ThermoEngine.CP, R = Mixtures.R;
        if (m.real) return Mixtures.phaseReal(c, comp, T, P, liquid, m.fn);
        let h = 0, s = 0, v = 0;
        comp.forEach((xi, i) => {
            if (!(xi > 0)) return;
            const n = c.names[i];
            if (liquid) {
                Mixtures.psat(c, i, T, m.fn);
                h += xi * CP.PropsSI('Hmolar', 'T', T, 'Q', 0, n); s += xi * (CP.PropsSI('Smolar', 'T', T, 'Q', 0, n) - R * Math.log(xi)); v += xi / CP.PropsSI('Dmolar', 'T', T, 'Q', 0, n);
            } else {
                const tk = T < c.Tc[i] ? 'T|gas' : 'T', pi = xi * P;
                h += xi * CP.PropsSI('Hmolar', tk, T, 'P', pi, n); s += xi * CP.PropsSI('Smolar', tk, T, 'P', pi, n);
            }
        });
        if (!liquid) v = R * T / P;
        else if (m.gamma) { const g = Mixtures.lnGamma(m.gamma, comp, m.fn); s -= R * comp.reduce((a, xi, i) => a + (xi > 0 ? xi * g[i] : 0), 0); }   // sE = -gE/T
        if (![h, s, v].every(Number.isFinite)) ThermoEngine.fail(CP, `${m.fn}() ${liquid ? 'liquid' : 'vapor'} of ${c.key} at T = ${T} K, P = ${P} Pa`);
        return { h, s, v };
    }
    static result(m, T, P, z, q, x, y) {   // q: molar vapor fraction; -0.001 / 1.001 in one phase
        const c = m.c, qq = Math.min(Math.max(q, 0), 1);
        const L = qq < 1 ? Mixtures.phase(m, x, T, P, true) : null, V = qq > 0 ? Mixtures.phase(m, y, T, P, false) : null;
        const mix = (k) => (L ? (1 - qq) * L[k] : 0) + (V ? qq * V[k] : 0), M = z.reduce((s, v, i) => s + v * c.M[i], 0);
        const h = mix('h') / M, v = mix('v') / M;
        return { T, P, q, z, x, y, M, h, s: mix('s') / M, v, u: h - P * v };
    }
    static stateTPz(m, T, P, z) {
        const c = m.c, rrq = (K) => {   // the vapor fraction of the Rachford-Rice equation, limited to 0..1
            const rr = (v) => z.reduce((s, zi, i) => s + zi * (K[i] - 1) / (1 + v * (K[i] - 1)), 0), r0 = rr(0), r1 = rr(1);
            return r0 <= 0 ? 0 : r1 >= 0 ? 1 : Mixtures.bracketed(rr, 0, 1, r0, r1);
        };
        let lnK = m.real ? Mixtures.wilson(c, T, P) : Mixtures.lnK(m, T, P, z, z), q = 0, x = z, y = z;
        // ideal: K is fixed, so the Rachford-Rice equation decides at once. Real: successive substitution from Wilson's K-values;
        // where it settles at q = 0 or 1 the mixture is one phase, and so it is when the trial vapor (at q = 0) or the trial
        // liquid (at q = 1) cannot exist at T, P
        for (let it = 0; it < 500; it++) {
            const K = lnK.map(Math.exp);
            q = rrq(K);
            x = Mixtures.norm(z.map((v, i) => v / (1 + q * (K[i] - 1)))); y = Mixtures.norm(x.map((v, i) => v * K[i]));
            if (m.ideal) break;
            let next;
            try { next = Mixtures.lnK(m, T, P, x, y); } catch (e) { if (q === 0 || q === 1) break; throw e; }
            const d = Math.max(...next.map((v, i) => Math.abs(v - lnK[i])));
            lnK = next;
            if (d < 1e-9) break;
            if (it === 499) throw new Error(`${m.fn}(): the phase equilibrium of ${c.key} did not converge at T = ${T} K, P = ${P} Pa (near the critical region of the mixture?)`);
        }
        if (q > 0 && q < 1 && Math.max(...lnK.map(Math.abs)) > 1e-4) return Mixtures.result(m, T, P, z, q, x, y);
        return Mixtures.result(m, T, P, z, q >= 1 ? 1.001 : -0.001, z, z);
    }
    // Two-phase states with 0 < q < 1 given: the temperature (at P) or the pressure (at T) between the bubble and dew points
    // where the flash gives q (q rises with T and falls with P)
    static satMid(m, z, q, T, P) {
        if (T === null) {
            const Tb = Mixtures.satT(m, P, z, 0).T, Td = Mixtures.satT(m, P, z, 1).T, f = (t) => Mixtures.stateTPz(m, t, P, z).q - q;
            const lo = Math.min(Tb, Td), hi = Math.max(Tb, Td);
            const t = hi - lo < 1e-9 ? lo : Mixtures.bracketed((t) => { const v = Mixtures.stateTPz(m, t, P, z).q; return Math.min(Math.max(v, 0), 1) - q; }, lo, hi, -q, 1 - q, 1e-10);
            const st = Mixtures.stateTPz(m, t, P, z);
            return Mixtures.result(m, t, P, z, q, st.x, st.y);
        }
        const Pb = Mixtures.satP(m, T, z, 0).P, Pd = Mixtures.satP(m, T, z, 1).P, lo = Math.log(Math.min(Pb, Pd)), hi = Math.log(Math.max(Pb, Pd));
        const u = hi - lo < 1e-12 ? lo : Mixtures.bracketed((u) => { const v = Mixtures.stateTPz(m, T, Math.exp(u), z).q; return Math.min(Math.max(v, 0), 1) - q; }, lo, hi, 1 - q, -q, 1e-10);
        const st = Mixtures.stateTPz(m, T, Math.exp(u), z);
        return Mixtures.result(m, T, Math.exp(u), z, q, st.x, st.y);
    }
    // Activity-coefficient models (gammamixture): parameters dimensionless and independent of T, as tabulated (Smith, Van Ness
    // and Abbott, Introduction to Chemical Engineering Thermodynamics, Ch. 13). Two fluids: Margules [A12, A21], van Laar
    // [A12, A21], Wilson [L12, L21], NRTL [t12, t21, alpha]; any number: Wilson, the n x n matrix L (L_ii = 1), and NRTL, the
    // 2n x n matrix of the n rows of tau (tau_ii = 0) followed by the n rows of alpha
    static gammaModel(g, n, fn) {
        const raw = g.raw && typeof g.raw === 'object' ? (typeof g.raw.toArray === 'function' ? g.raw.toArray() : g.raw) : null;
        if (!raw) throw new Error(`${fn}(): give the parameters of the ${g.model} model as an array, such as [1.2, 0.8]`);
        const num = (v) => ThermoEngine.num(v, `${fn}() ${g.model} parameter`);
        const flat = raw.flat(Infinity).map(num), mat = (rows, k) => rows.slice(k * n, (k + 1) * n);
        const two = (len, what) => { if (n !== 2 || flat.length !== len || Array.isArray(raw[0])) throw new Error(`${fn}(): the ${g.model} model takes ${what}${n !== 2 ? ' and two fluids' : ''}`); };
        if (g.model === 'margules' || g.model === 'vanlaar') {
            two(2, '[A12, A21]');
            if (g.model === 'vanlaar' && !(flat[0] * flat[1] > 0)) throw new Error(`${fn}(): the van Laar parameters A12 and A21 must be nonzero and of the same sign`);
            return { model: g.model, A12: flat[0], A21: flat[1], key: g.model + flat.join(',') };
        }
        if (g.model === 'wilson') {
            let L;
            if (!Array.isArray(raw[0])) { two(2, '[L12, L21], or an n x n matrix'); L = [[1, flat[0]], [flat[1], 1]]; }
            else { L = raw.map(r => r.map(num)); if (L.length !== n || L.some(r => r.length !== n)) throw new Error(`${fn}(): the Wilson matrix must be ${n} x ${n}`); }
            if (!L.flat().every(v => v > 0)) throw new Error(`${fn}(): the Wilson parameters must be positive`);
            return { model: 'wilson', L, key: 'wilson' + JSON.stringify(L) };
        }
        if (g.model === 'nrtl') {
            let tau, alpha;
            if (!Array.isArray(raw[0])) { two(3, '[tau12, tau21, alpha], or a 2n x n matrix (the rows of tau, then those of alpha)'); tau = [[0, flat[0]], [flat[1], 0]]; alpha = [[0, flat[2]], [flat[2], 0]]; }
            else {
                const rows = raw.map(r => r.map(num));
                if (rows.length !== 2 * n || rows.some(r => r.length !== n)) throw new Error(`${fn}(): the NRTL parameters for ${n} fluids are a ${2 * n} x ${n} matrix: the ${n} rows of tau, then the ${n} rows of alpha`);
                tau = mat(rows, 0); alpha = mat(rows, 1);
            }
            return { model: 'nrtl', tau, alpha, key: 'nrtl' + JSON.stringify([tau, alpha]) };
        }
        throw new Error(`${fn}(): unknown model '${g.model}'; use margules, vanlaar, wilson or nrtl`);
    }
    static lnGamma(g, x, fn) {
        const n = x.length;
        if (g.model === 'margules') { const [x1, x2] = x; return [x2 * x2 * (g.A12 + 2 * (g.A21 - g.A12) * x1), x1 * x1 * (g.A21 + 2 * (g.A12 - g.A21) * x2)]; }
        if (g.model === 'vanlaar') {
            const [x1, x2] = x, d = g.A12 * x1 + g.A21 * x2;
            return [g.A12 * (g.A21 * x2 / d) ** 2, g.A21 * (g.A12 * x1 / d) ** 2];
        }
        if (g.model === 'wilson') {
            const L = g.L, S = x.map((v, i) => x.reduce((a, xj, j) => a + xj * L[i][j], 0));
            return x.map((v, i) => 1 - Math.log(S[i]) - x.reduce((a, xk, k) => a + xk * L[k][i] / S[k], 0));
        }
        const { tau, alpha } = g, G = tau.map((r, i) => r.map((t, j) => Math.exp(-alpha[i][j] * t)));
        const D = x.map((v, j) => x.reduce((a, xk, k) => a + xk * G[k][j], 0)), Nm = x.map((v, j) => x.reduce((a, xk, k) => a + xk * tau[k][j] * G[k][j], 0));
        return x.map((v, i) => Nm[i] / D[i] + x.reduce((a, xj, j) => a + xj * G[i][j] / D[j] * (tau[i][j] - Nm[j] / D[j]), 0));
    }
    // Fugacities, fugacity and activity coefficients and excess properties of the liquid of a state (outputs f1, phil1,
    // phiv1, gamma1, hE, sE, gE, vE). Real: from CoolProp, the activity coefficient relative to the pure liquid at T, P;
    // ideal: phi_liquid = Psat/P, the vapor an ideal gas, gamma = 1; gamma models: phi_liquid = gamma Psat/P, hE = vE = 0
    static extra(m, st, o) {
        const c = m.c, { T, P, x, y, q } = st, R = Mixtures.R, k = /\d+$/.test(o) ? +o.match(/\d+$/)[0] - 1 : -1;
        const hasL = q < 1 + 1e-12, hasV = q > -1e-12;
        const needL = () => { if (!hasL) throw new Error(`${m.fn}(): '${o}' is a property of the liquid, and this state (q = ${q}) is all vapor`); };
        if (k >= c.n) throw new Error(`${m.fn}(): there are ${c.n} fluids, not ${k + 1}`);
        let lnphiL = null, lnphiV = null, lng = null, hE = 0, vE = 0;
        const pureL = (i) => { const e = c.names.map((n, j) => (j === i ? 1 : 0)); return Mixtures.phaseReal(c, e, T, P, true, m.fn); };
        if (m.real) {
            if (hasL) {
                const L = Mixtures.phaseReal(c, x, T, P, true, m.fn); lnphiL = L.lnphi;
                const pure = c.names.map((n, i) => pureL(i));
                lng = x.map((v, i) => L.lnphi[i] - pure[i].lnphi[i]);
                hE = L.h - x.reduce((a, xi, i) => a + xi * pure[i].h, 0); vE = L.v - x.reduce((a, xi, i) => a + xi * pure[i].v, 0);
            }
            if (hasV) lnphiV = Mixtures.phaseReal(c, y, T, P, false, m.fn).lnphi;
        } else {
            lng = m.gamma ? Mixtures.lnGamma(m.gamma, x, m.fn) : x.map(() => 0);
            if (hasL) lnphiL = c.names.map((n, i) => Math.log(Mixtures.psat(c, i, T, m.fn) / P) + lng[i]);
            lnphiV = c.names.map(() => 0);
        }
        const gE = hasL ? R * T * x.reduce((a, xi, i) => a + (xi > 0 ? xi * lng[i] : 0), 0) : 0;
        if (o.startsWith('phil')) { needL(); return Math.exp(lnphiL[k]); }
        if (o.startsWith('phiv')) { if (!hasV) throw new Error(`${m.fn}(): '${o}' is a property of the vapor, and this state (q = ${q}) is all liquid`); return Math.exp(lnphiV[k]); }
        if (o.startsWith('gamma')) { needL(); return Math.exp(lng[k]); }
        if (o.startsWith('f')) return hasL ? x[k] * Math.exp(lnphiL[k]) * P : y[k] * Math.exp(lnphiV[k]) * P;
        needL();
        return { he: hE, ve: vE, ge: gE, se: (hE - gE) / T }[o];
    }
    // inputs and outputs, as nh3h2o()
    static evaluate(name, a) {
        const fn = name, num = (v, k) => ThermoEngine.num(v, `${fn}() value for '${k}'`);
        let gamma = null;
        if (name === 'gammamixture') {   // the model and its parameters come after the fluids
            if (a.length !== 10) throw new Error("gammamixture(): use gammamixture('output', 'fluid1&fluid2', 'model', [parameters], 'key1', v1, 'key2', v2, 'key3', v3), model margules, vanlaar, wilson or nrtl");
            gamma = { model: String(a[2]).trim().toLowerCase(), raw: a[3] };
            a = [a[0], a[1], ...a.slice(4)];
        }
        if (a.length !== 8) throw new Error(`${fn}(): use ${fn}('output', 'fluid1&fluid2', 'key1', v1, 'key2', v2, 'key3', v3), keys T, P, x, q or h`);
        const c = Mixtures.info(a[1], fn), m = { c, ideal: name === 'idealmixture', real: name === 'mixture', gamma: gamma && Mixtures.gammaModel(gamma, c.n, fn), fn };
        if (m.real) Mixtures.real(c, fn);
        const o = String(a[0]).trim().toLowerCase(), om = /^(x|xl|yv)(\d+)$/.exec(o), oe = /^(f|phil|phiv|gamma)(\d+)$/.exec(o) || /^(he|se|ge|ve)$/.exec(o);
        if (!(['t', 'p', 'x', 'h', 's', 'u', 'v', 'q', 'xl', 'yv', 'm'].includes(o) && !(c.n > 2 && ['x', 'xl', 'yv'].includes(o))) && !(om && +om[2] >= 1 && +om[2] <= c.n) && !(oe && (!oe[2] || (+oe[2] >= 1 && +oe[2] <= c.n))))
            throw new Error(`${fn}(): unknown output '${a[0]}'; use T, P, q, h, s, u, v, M, ${c.n === 2 ? 'x, xl, yv (of the first fluid) or ' : ''}x1, xl1, yv1 ... x${c.n}, xl${c.n}, yv${c.n}; f1, phil1, phiv1, gamma1 ...; hE, sE, gE, vE`);
        const inp = {};
        for (let i = 2; i < 8; i += 2) {
            const k = String(a[i]).trim().toLowerCase();
            if (!['t', 'p', 'x', 'q', 'h'].includes(k)) throw new Error(`${fn}(): unknown input '${a[i]}'; the inputs are T, P, x, q and h`);
            if (k in inp) throw new Error(`${fn}(): input '${a[i]}' is given twice`);
            if (k === 'x') {
                let z = a[i + 1];
                if (z && typeof z === 'object') z = (typeof z.toArray === 'function' ? z.toArray() : z).flat(Infinity).map(v => num(v, 'x'));
                else { z = num(z, 'x'); if (c.n !== 2) throw new Error(`${fn}(): with ${c.n} fluids, give x as an array of their ${c.n} mole fractions, [x1, ..., x${c.n}]`); z = [z, 1 - z]; }
                if (z.length !== c.n) throw new Error(`${fn}(): x has ${z.length} mole fractions for ${c.n} fluids`);
                if (!z.every(v => v >= 0 && v <= 1)) throw new Error(`${fn}(): the mole fractions must be between 0 and 1, not ${z.join(', ')}`);
                const sum = z.reduce((s, v) => s + v, 0);
                if (Math.abs(sum - 1) > 1e-6) throw new Error(`${fn}(): the mole fractions add up to ${+sum.toPrecision(8)}, not 1`);
                inp.x = z.map(v => v / sum);
            } else inp[k] = num(a[i + 1], a[i]);
        }
        const has = (...ks) => ks.every(k => k in inp);
        if ('q' in inp && !(inp.q >= 0 && inp.q <= 1)) throw new Error(`${fn}(): q = ${inp.q} must be a molar vapor fraction from 0 to 1 (a saturated or two-phase state)`);
        if ('t' in inp && !(inp.t > 0)) throw new Error(`${fn}(): T = ${inp.t} K must be positive`);
        if ('p' in inp && !(inp.p > 0)) throw new Error(`${fn}(): P = ${inp.p} Pa must be positive`);
        const ck = `${fn}|${c.key}|${m.gamma ? m.gamma.key : ''}|${JSON.stringify(inp)}`;
        let st = Mixtures.states.get(ck);
        if (st) { Mixtures.states.delete(ck); Mixtures.states.set(ck, st); }   // most recent last
        else if (has('t', 'p', 'x')) st = Mixtures.stateTPz(m, inp.t, inp.p, inp.x);
        else if (has('p', 'x', 'q') && inp.q > 0 && inp.q < 1) st = Mixtures.satMid(m, inp.x, inp.q, null, inp.p);
        else if (has('t', 'x', 'q') && inp.q > 0 && inp.q < 1) st = Mixtures.satMid(m, inp.x, inp.q, inp.t, null);
        else if (has('p', 'x', 'q')) { const s = Mixtures.satT(m, inp.p, inp.x, inp.q); st = Mixtures.result(m, s.T, inp.p, inp.x, inp.q, s.x, s.y); }
        else if (has('t', 'x', 'q')) { const s = Mixtures.satP(m, inp.t, inp.x, inp.q); st = Mixtures.result(m, inp.t, s.P, inp.x, inp.q, s.x, s.y); }
        else if (has('t', 'p', 'q')) {
            if (c.n !== 2) throw new Error(`${fn}(): T, P and q fix the phases only for two fluids; give x as well`);
            if (inp.q !== 0 && inp.q !== 1) throw new Error(`${fn}(): with T, P and q, q must be 0 (the saturated liquid) or 1 (the saturated vapor); give x as well for other states`);
            // two fluids at T, P: the compositions of the phases, x1 = (1 - K2)/(K1 - K2), y1 = K1 x1
            const T = inp.t, P = inp.p, none = `${fn}(): at T = ${T} K, P = ${P} Pa there are no two phases of ${c.key} in equilibrium`;
            let lnK = m.real ? Mixtures.wilson(c, T, P) : Mixtures.lnK(m, T, P, [0.5, 0.5], [0.5, 0.5]), x, y;
            for (let it = 0; it < 300; it++) {
                const K = lnK.map(Math.exp), x1 = (1 - K[1]) / (K[0] - K[1]);
                if (!(x1 > -1e-9 && x1 < 1 + 1e-9 && K[0] * x1 < 1 + 1e-9)) throw new Error(none);
                x = [Math.min(Math.max(x1, 0), 1)]; x.push(1 - x[0]); y = Mixtures.norm([K[0] * x[0], K[1] * x[1]]);
                if (m.ideal) break;
                const next = Mixtures.lnK(m, T, P, x, y), d = Math.max(...next.map((v, i) => Math.abs(v - lnK[i])));
                lnK = next;
                if (d < 1e-9) break;
            }
            if (m.real && Math.abs(x[0] - y[0]) < 1e-6) throw new Error(none);
            st = Mixtures.result(m, inp.t, inp.p, inp.q === 0 ? x : y, inp.q, x, y);
        } else if (has('p', 'x', 'h')) {
            const b = Mixtures.satT(m, inp.p, inp.x, 0).T, f = (T) => Mixtures.stateTPz(m, T, inp.p, inp.x).h - inp.h;   // h rises with T at fixed P and x
            st = Mixtures.stateTPz(m, Mixtures.root(f, b, 10, m.real ? 50 : Math.max(...c.Tmin), m.real ? 2000 : Math.min(...c.Tc), `${fn}(): no temperature gives h = ${inp.h} J/kg at this P and x`), inp.p, inp.x);
        } else throw new Error(`${fn}(): the inputs must be T, P, x or P, x, q or T, x, q or T, P, q or P, x, h`);
        if (!Mixtures.states.has(ck)) { Mixtures.states.set(ck, st); if (Mixtures.states.size > 500) Mixtures.states.delete(Mixtures.states.keys().next().value); }
        const pick = (arr, k) => arr[k];
        if (oe) return Mixtures.extra(m, st, o);
        if (om) { const k = +om[2] - 1; return pick(om[1] === 'x' ? st.z : om[1] === 'xl' ? st.x : st.y, k); }
        if (o === 'x') return st.z[0];
        if (o === 'xl') return st.x[0];
        if (o === 'yv') return st.y[0];
        return { t: st.T, p: st.P, h: st.h, s: st.s, u: st.u, v: st.v, q: st.q, m: st.M }[o];
    }
    // Kay's rule: pseudocritical Tc, Pc and acentric factor of a mixture, mole-fraction averages of the fluids' (W. B. Kay,
    // Ind. Eng. Chem. 28, 1014, 1936), for the generalized (Lee-Kesler) functions
    static pseudo(a) {
        const fn = 'pseudocritical';
        if (a.length !== 3) throw new Error("pseudocritical(): use pseudocritical('Tc', 'fluid1&fluid2', x) (Tc, Pc or omega), x the mole fraction of the first fluid or an array of all of them");
        const o = String(a[0]).trim().toLowerCase(), c = Mixtures.info(a[1], fn);
        let z = a[2];
        if (z && typeof z === 'object') z = (typeof z.toArray === 'function' ? z.toArray() : z).flat(Infinity).map(v => ThermoEngine.num(v, 'pseudocritical() x'));
        else { z = ThermoEngine.num(z, 'pseudocritical() x'); if (c.n !== 2) throw new Error(`pseudocritical(): with ${c.n} fluids, give x as an array of ${c.n} mole fractions`); z = [z, 1 - z]; }
        if (z.length !== c.n) throw new Error(`pseudocritical(): x has ${z.length} mole fractions for ${c.n} fluids`);
        const sum = z.reduce((p, v) => p + v, 0);
        if (Math.abs(sum - 1) > 1e-6 || !z.every(v => v >= 0)) throw new Error(`pseudocritical(): the mole fractions must be at least 0 and add up to 1, not ${+sum.toPrecision(8)}`);
        const prop = { tc: c.Tc, pc: c.Pc, omega: c.w }[o];
        if (!prop) throw new Error(`pseudocritical(): unknown output '${a[0]}'; use Tc, Pc or omega`);
        return z.reduce((p, v, i) => p + v * prop[i], 0) / sum;
    }
    // molefraction('a&b', w) and massfraction('a&b', x): the fraction of the first fluid; for more fluids, an array and the
    // index of the fluid wanted
    static convert(name, a) {
        const toMass = name === 'massfraction', fn = name;
        if (a.length !== 2 && a.length !== 3) throw new Error(`${fn}(): use ${fn}('fluid1&fluid2', ${toMass ? 'x' : 'w'}) for the first fluid, or ${fn}('fluid1&fluid2&fluid3', [..., ..., ...], i) for fluid i`);
        const c = Mixtures.info(a[0], fn);
        let f = a[1], i = 0;
        if (f && typeof f === 'object') f = (typeof f.toArray === 'function' ? f.toArray() : f).flat(Infinity).map(v => ThermoEngine.num(v, `${fn}() fraction`));
        else { f = ThermoEngine.num(f, `${fn}() fraction`); if (c.n !== 2) throw new Error(`${fn}(): with ${c.n} fluids, give an array of ${c.n} fractions and the index of the fluid wanted`); f = [f, 1 - f]; }
        if (f.length !== c.n) throw new Error(`${fn}(): ${f.length} fractions for ${c.n} fluids`);
        if (a.length === 3) { i = ThermoEngine.num(a[2], `${fn}() index`) - 1; if (!(Number.isInteger(i) && i >= 0 && i < c.n)) throw new Error(`${fn}(): the index must be 1 to ${c.n}`); }
        else if (c.n !== 2) throw new Error(`${fn}(): give the index of the fluid wanted, 1 to ${c.n}`);
        const wts = f.map((v, k) => toMass ? v * c.M[k] : v / c.M[k]), s = wts.reduce((p, v) => p + v, 0);
        return wts[i] / s;
    }
}

// Solutions of a nonvolatile solute (a salt, a sugar, a glycol) in a liquid solvent, as an ideal solution: the solvent's
// activity is its mole fraction counting every particle of the solute,
//     a = n_solvent/(n_solvent + nu n_solute)
// with nu the ions per formula unit of a salt taken as fully dissociated (2 for NaCl, 3 for CaCl2) and 1 for a molecular solute.
// The solvent in the solution has the Gibbs energy of the pure liquid plus (R/M) T ln a, so each property is where it equals
// that of the other phase of pure solvent (through CoolProp, liquid and vapor imposed, so slightly metastable states are used):
//     vapor pressure P at T, and boiling point T at P:  g_vapor(T, P) = g_liquid(T, P) + (R/M) T ln a
//     osmotic pressure Pi:                              g_liquid(T, P + Pi) = g_liquid(T, P) - (R/M) T ln a
//     freezing point (water):                           g_ice(T, P) = g_liquid(T, P) + (R/M) T ln a
// (ice Ih of IAPWS R10-06, above; liquid water of IAPWS-95, supercooled below 273.16 K). In dilute solutions these become
// Raoult's law, the ebullioscopic and cryoscopic constants R T^2 M/Dh and van 't Hoff's law, without taking the vapor as an
// ideal gas. The solutes listed
// have molar masses from their formulas and the standard atomic weights (IUPAC 2021, abridged values); any other solute can be
// given by its molar mass M and nu.
class Solutions {
    static AW = { H: 1.008, Li: 6.94, C: 12.011, N: 14.007, O: 15.999, Na: 22.990, Mg: 24.305, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078 };
    static LIST = [['NaCl', 2, 'sodium chloride'], ['KCl', 2, 'potassium chloride'], ['CaCl2', 3, 'calcium chloride'], ['MgCl2', 3, 'magnesium chloride'],
        ['LiCl', 2, 'lithium chloride'], ['Na2SO4', 3, 'sodium sulfate'], ['Na2CO3', 3, 'sodium carbonate'], ['NaOH', 2, 'sodium hydroxide'], ['KOH', 2, 'potassium hydroxide'],
        ['NH4NO3', 2, 'ammonium nitrate'], ['C12H22O11', 1, 'sucrose'], ['C6H12O6', 1, 'glucose'], ['CH4N2O', 1, 'urea'], ['C2H6O2', 1, 'ethylene glycol'],
        ['C3H8O2', 1, 'propylene glycol'], ['C3H8O3', 1, 'glycerol']];
    static molar(formula) { let M = 0; for (const [, el, n] of formula.matchAll(/([A-Z][a-z]?)(\d*)/g)) M += Solutions.AW[el] * (n ? +n : 1); return M / 1000; }
    static solute(name) {
        const k = String(name).trim().toLowerCase().replace(/[\s_-]+/g, '');
        const e = Solutions.LIST.find(([f, nu, nm]) => f.toLowerCase() === k || nm.replace(/\s+/g, '') === k);
        return e ? { name: e[0], M: Solutions.molar(e[0]), nu: e[1] } : null;
    }
    static evaluate(a) {
        const fn = 'solution', CP = ThermoEngine.CP;
        if (a.length < 4 || a.length % 2 !== 0) throw new Error("solution(): use solution('output', 'NaCl&water', 'key1', v1, 'key2', v2), keys T or P and w or m");
        const o = String(a[0]).trim().toLowerCase(), OUT = ['p', 't', 'dt', 'tf', 'dtf', 'pi', 'aw', 'm', 'w'];
        if (!OUT.includes(o)) throw new Error(`solution(): unknown output '${a[0]}'; use P, T, dT, Tf, dTf, Pi, aw, m or w`);
        const parts = String(a[1]).split('&').map(s => s.trim());
        const inp = {};
        for (let i = 2; i < a.length; i += 2) {
            const k = String(a[i]).trim();
            const kk = k === 'M' ? 'M' : k.toLowerCase();
            if (!['t', 'p', 'w', 'm', 'M', 'nu'].includes(kk)) throw new Error(`solution(): unknown input '${a[i]}'; the inputs are T, P, w (the solute mass fraction) or m (the molality, mol/kg), and M and nu for a solute not listed`);
            if (kk in inp) throw new Error(`solution(): input '${a[i]}' is given twice`);
            inp[kk] = ThermoEngine.num(a[i + 1], `solution() value for '${k}'`);
        }
        let sol, solvent;
        if (parts.length === 2) {
            sol = Solutions.solute(parts[0]); solvent = parts[1];
            if (!sol) throw new Error(`solution(): '${parts[0]}' is not one of the solutes listed (see Solutions in Help); give any other by its molar mass and ions, as solution('${a[0]}', '${parts[1]}', ..., 'M', 0.1, 'nu', 1)`);
            if ('M' in inp || 'nu' in inp) throw new Error(`solution(): M and nu are known for ${sol.name}; give them only for a solute not listed, naming the solvent alone`);
        } else if (parts.length === 1) {
            solvent = parts[0];
            if (!('M' in inp && 'nu' in inp)) throw new Error("solution(): name the solute and the solvent, as 'NaCl&water', or give the solvent alone with the solute's molar mass M (kg/mol) and its particles per formula unit nu");
            if (!(inp.M > 0) || !(Number.isInteger(inp.nu) && inp.nu >= 1)) throw new Error('solution(): M must be positive (kg/mol) and nu a whole number of 1 or more');
            sol = { name: 'the solute', M: inp.M, nu: inp.nu };
        } else throw new Error("solution(): name one solute and one solvent, as 'NaCl&water'");
        let sv = '';
        try { sv = CP.get_fluid_param_string(solvent, 'name'); } catch (e) { }
        if (!sv) throw new Error(`solution(): '${solvent}' is not a CoolProp fluid`);
        const Ms = CP.Props1SI(sv, 'M');
        if (('w' in inp) === ('m' in inp)) throw new Error('solution(): give the composition once, as w (the solute mass fraction) or m (the molality, mol per kg of solvent)');
        if ('w' in inp && !(inp.w >= 0 && inp.w < 1)) throw new Error(`solution(): w = ${inp.w} must be a mass fraction from 0 to less than 1`);
        if ('m' in inp && !(inp.m >= 0)) throw new Error(`solution(): m = ${inp.m} mol/kg cannot be negative`);
        const m = 'm' in inp ? inp.m : inp.w / (sol.M * (1 - inp.w)), w = 'w' in inp ? inp.w : m * sol.M / (1 + m * sol.M);
        const aw = (1 / Ms) / (1 / Ms + sol.nu * m);
        if (o === 'aw') return aw;
        if (o === 'm') return m;
        if (o === 'w') return w;
        const need = (k, what) => { if (!(k in inp)) throw new Error(`solution(): ${what} needs ${k === 't' ? 'T' : 'P'}`); return inp[k]; };
        const Tt = CP.Props1SI(sv, 'Ttriple'), Tc = CP.Props1SI(sv, 'Tcrit'), Pc = CP.Props1SI(sv, 'pcrit');
        const Rs = Mixtures.R / Ms, lna = Math.log(aw);
        const gL = (T, P) => CP.PropsSI('Gmass', 'T|liquid', T, 'P', P, sv), gV = (T, P) => CP.PropsSI('Gmass', 'T|gas', T, 'P', P, sv);
        const bisect = (f, lo, hi) => { let flo = f(lo); for (let k = 0; k < 200 && hi - lo > 1e-13 * Math.abs(hi); k++) { const mid = (lo + hi) / 2, fm = f(mid); if ((fm < 0) === (flo < 0)) { lo = mid; flo = fm; } else hi = mid; } return (lo + hi) / 2; };
        if (o === 'p' || o === 'pi') {
            const T = need('t', o === 'p' ? 'the vapor pressure' : 'the osmotic pressure');
            if (!(T >= Tt && T < Tc)) throw new Error(`solution(): T = ${T} K is outside the liquid range of ${sv}, ${+Tt.toPrecision(6)} to ${+Tc.toPrecision(6)} K`);
            const Psat = CP.PropsSI('P', 'T', T, 'Q', 0, sv);
            if (aw === 1) return o === 'p' ? Psat : 0;
            if (o === 'p') { const f = (u) => gV(T, Math.exp(u)) - gL(T, Math.exp(u)) - Rs * T * lna; return Math.exp(bisect(f, Math.log(0.5 * aw * Psat), Math.log(Psat))); }
            const P = Math.max('p' in inp ? inp.p : 101325, Psat), g0 = gL(T, P), est = -Rs * T * lna / (1 / CP.PropsSI('D', 'T|liquid', T, 'P', P, sv));
            const f = (Pi) => gL(T, P + Pi) - g0 + Rs * T * lna;
            let hi = 2 * est; while (f(hi) < 0 && hi < 1e10) hi *= 2;
            return bisect(f, 0, hi);
        }
        const P = o === 'tf' || o === 'dtf' ? ('p' in inp ? inp.p : 101325) : need('p', 'the boiling point');
        if (o === 't' || o === 'dt') {
            const Pt = CP.Props1SI(sv, 'ptriple');
            if (!(P >= Pt && P < Pc)) throw new Error(`solution(): P = ${P} Pa is outside the boiling range of ${sv}, ${+Pt.toPrecision(6)} to ${+Pc.toPrecision(6)} Pa`);
            const T0 = CP.PropsSI('T', 'P', P, 'Q', 0, sv);
            if (aw === 1) return o === 't' ? T0 : 0;
            const f = (T) => gV(T, P) - gL(T, P) - Rs * T * lna;   // positive at T0, falling with T
            let hi = P / aw < Pc ? CP.PropsSI('T', 'P', P / aw, 'Q', 0, sv) + 1 : Tc;
            if (!(f(hi) < 0)) throw new Error(`solution(): no boiling point of this solution of ${sv} found at P = ${P} Pa below ${+hi.toPrecision(6)} K`);
            const T = bisect(f, T0, hi);
            return o === 't' ? T : T - T0;
        }
        if (sv !== 'Water') throw new Error('solution(): the freezing point is available for water only (ice Ih)');
        if (!(P >= IceIh.pt && P <= 100e6)) throw new Error(`solution(): P = ${P} Pa is outside 611.657 Pa to 100 MPa for the freezing point`);
        const Tm = IceIh.Tmelt(P);
        if (aw === 1) return o === 'tf' ? Tm : 0;
        const f = (T) => IceIh.gibbs(T, P).g - gL(T, P) - Rs * T * lna;
        const lo = 240, flo = f(lo);
        if (!(flo < 0)) throw new Error(`solution(): the freezing point is below 240 K (-33 degC), the lowest temperature of supercooled water here; the solution is too concentrated for this ideal model`);
        const Tf = bisect(f, lo, Tm + 0.01);
        if (o === 'tf') return Tf;
        // the depression from the melting point of the same two Gibbs functions (the R14-08 melting curve differs slightly)
        return bisect((T) => IceIh.gibbs(T, P).g - gL(T, P), Tm - 0.01, Tm + 0.01) - Tf;
    }
}

// Reactions and chemical equilibrium of ideal-gas mixtures, from the NASA polynomials of the ideal-gas species (IdealGas).
// reaction(): dH, dS, dG, ln K and the reversible cell voltage of a reaction at T, standard pressure 1 bar; H2O(l) is liquid
// water, from the gas by CoolProp's IAPWS-95 (its h and s relative to the ideal gas at the same T).
// equilibrium(): the composition that minimizes the Gibbs energy at T, P (or at P and h, s, or adiabatic from reactants at Tr),
// by the element-potential (RAND) method of S. Gordon and B. J. McBride, Computer program for calculation of complex chemical
// equilibrium compositions and applications, NASA RP-1311, 1994 (Eqs. 2.24 to 2.26, and the step control of Eqs. 3.1 to 3.2):
//     d ln n_j = -mu_j/RT + sum_i a_ij pi_i + d ln n,   mu_j/RT = g_j/RT + ln(n_j/n) + ln(P/P0)
// with the pi_i and d ln n from the element balances and the total moles. Gas phase only (no solid carbon).
class Chem {
    static P0 = 1e5;
    // 'CH4 + 2 (O2 + 3.76 N2)' -> [{ key, n, liquid }]
    static parse(text, fn) {
        const s = String(text).trim(), out = new Map();
        let i = 0;
        const skip = () => { while (s[i] === ' ') i++; };
        const fail = () => { throw new Error(`${fn}(): cannot read '${s.slice(i) || s}' in '${s}'; write terms such as  2 O2  or  2 (O2 + 3.76 N2)  joined by +`); };
        const side = (mult) => {
            for (;;) {
                skip();
                let coef = 1;
                const m = /^(\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
                if (m) { coef = Number(m[0]); i += m[0].length; skip(); }
                if (s[i] === '(') { i++; side(mult * coef); skip(); if (s[i] !== ')') fail(); i++; }
                else {
                    const n = /^[A-Za-z][A-Za-z0-9]*(\((?:l|g)\))?/.exec(s.slice(i));
                    if (!n) fail();
                    i += n[0].length;
                    const liquid = n[1] === '(l)', base = n[0].replace(/\((?:l|g)\)$/, '');
                    let key;
                    try { key = IdealGas.species(base).key; } catch (e) { throw new Error(`${fn}(): '${base}' is not one of the ideal-gas species (see the list in Help)`); }
                    if (liquid && key !== 'H2O') throw new Error(`${fn}(): only water can be liquid, H2O(l)`);
                    const id = liquid ? 'H2O(l)' : key;
                    out.set(id, (out.get(id) || 0) + mult * coef);
                }
                skip();
                if (s[i] === '+') { i++; continue; }
                return;
            }
        };
        side(1);
        if (i < s.length) fail();
        return [...out].map(([key, n]) => ({ key, n, liquid: key === 'H2O(l)' }));
    }
    static atoms(key) { return IdealGas.formula(key === 'H2O(l)' ? 'H2O' : key); }
    // molar h (J/mol) and s at 1 bar (J/(mol K)) of a species at T
    static hs(key, T, fn) {
        const R = IdealGas.R;
        if (key !== 'H2O(l)') { const sp = IdealGas.species(key), a = IdealGas._poly(sp, T, `${fn}()`); return { h: R * T * IdealGas.hRT(a, T), s: R * IdealGas.s0R(a, T) }; }
        if (!(T >= 273.16 && T < 647.096)) throw new Error(`${fn}(): liquid water needs 273.16 K <= T < 647.096 K, not ${T} K`);
        const CP = ThermoEngine.CP, g = Chem.hs('H2O', T, fn), Pl = Math.max(Chem.P0, CP.PropsSI('P', 'T', T, 'Q', 0, 'Water'));
        const hl = CP.PropsSI('Hmolar', 'T|liquid', T, 'P', Pl, 'Water'), sl = CP.PropsSI('Smolar', 'T|liquid', T, 'P', Pl, 'Water');
        const hi = CP.PropsSI('Hmolar', 'T|gas', T, 'P', 1, 'Water'), si = CP.PropsSI('Smolar', 'T|gas', T, 'P', 1, 'Water') - R * Math.log(Chem.P0 / 1);   // ideal gas at 1 bar
        return { h: g.h + hl - hi, s: g.s + sl - si };
    }
    static reaction(a) {
        const fn = 'reaction', R = IdealGas.R;
        if (a.length < 4 || a.length % 2 !== 0) throw new Error("reaction(): use reaction('output', 'H2 + 0.5 O2 -> H2O(l)', 'T', T), with 'n', electrons for E0");
        const o = String(a[0]).trim().toLowerCase();
        if (!['dh', 'ds', 'dg', 'lnk', 'k', 'e0'].includes(o)) throw new Error(`reaction(): unknown output '${a[0]}'; use dH, dS, dG, lnK, K or E0`);
        const parts = String(a[1]).split(/<=>|->|=>|=/);
        if (parts.length !== 2) throw new Error("reaction(): write the reaction as  reactants -> products");
        const inp = {};
        for (let i = 2; i < a.length; i += 2) {
            const k = String(a[i]).trim().toLowerCase();
            if (k !== 't' && k !== 'n') throw new Error(`reaction(): unknown input '${a[i]}'; the inputs are T and n (electrons, for E0)`);
            inp[k] = ThermoEngine.num(a[i + 1], `reaction() ${a[i]}`);
        }
        if (!('t' in inp)) throw new Error('reaction(): give the temperature, T');
        const L = Chem.parse(parts[0], fn), Rt = Chem.parse(parts[1], fn), terms = [...L.map(t => ({ ...t, n: -t.n })), ...Rt];
        const bal = {};
        terms.forEach(t => Object.entries(Chem.atoms(t.key)).forEach(([e, k]) => { bal[e] = (bal[e] || 0) + t.n * k; }));
        const off = Object.entries(bal).filter(([e, v]) => Math.abs(v) > 1e-9);
        if (off.length) throw new Error(`reaction(): the reaction is not balanced in ${off.map(([e, v]) => `${e} (${v > 0 ? '+' : ''}${+v.toPrecision(6)})`).join(', ')}`);
        const T = inp.t;
        let dH = 0, dS = 0;
        terms.forEach(t => { const p = Chem.hs(t.key, T, fn); dH += t.n * p.h; dS += t.n * p.s; });
        const dG = dH - T * dS;
        if (o === 'e0') { if (!(inp.n > 0)) throw new Error('reaction(): E0 needs n, the electrons transferred per reaction as written'); return -dG / (inp.n * IdealGas.CONSTS.faraday[0]); }
        return { dh: dH, ds: dS, dg: dG, lnk: -dG / (R * T), k: Math.exp(-dG / (R * T)) }[o];
    }
    // The system of an equilibrium problem, cached: elements, species and their atoms, the moles of atoms of the reactants
    static systems = new Map();
    static system(text, list, fn) {
        const key = `${text}|${list || ''}`;
        if (Chem.systems.has(key)) return Chem.systems.get(key);
        const react = Chem.parse(text, fn);
        if (react.some(r => r.liquid)) throw new Error(`${fn}(): the reactants are ideal gases; give a liquid fuel's enthalpy with the key h instead`);
        if (react.some(r => !(r.n > 0))) throw new Error(`${fn}(): the amounts of the reactants must be positive`);
        const b = {};
        react.forEach(r => Object.entries(Chem.atoms(r.key)).forEach(([e, k]) => { b[e] = (b[e] || 0) + r.n * k; }));
        const els = Object.keys(b);
        let species;
        if (list) {
            species = String(list).trim().split(/[\s,]+/).map(nm => { try { return IdealGas.species(nm).key; } catch (e) { throw new Error(`${fn}(): '${nm}' is not one of the ideal-gas species`); } });
            for (const sp of species) { const bad = Object.keys(Chem.atoms(sp)).filter(e => !els.includes(e)); if (bad.length) throw new Error(`${fn}(): ${sp} contains ${bad.join(', ')}, which the reactants do not`); }
            for (const e of els) if (!species.some(sp => e in Chem.atoms(sp))) throw new Error(`${fn}(): no product species contains ${e}`);
        } else {   // every species made of the reactants' elements, except organic molecules of more than 2 carbon atoms not among the reactants
            species = Object.keys(IDEAL_GAS_DB).filter(sp => { const at = Chem.atoms(sp); return Object.keys(at).every(e => els.includes(e)) && ((at.C || 0) <= 2 || react.some(r => r.key === sp)); });
        }
        species = [...new Set(species)];
        const A = els.map(e => species.map(sp => Chem.atoms(sp)[e] || 0));
        const recs = species.map(sp => IdealGas.species(sp));
        const lo = Math.max(...recs.map(r => Math.min(r.rec.T[0], IdealGas.TREF))), hi = Math.min(...recs.map(r => r.rec.T[r.rec.T.length - 1]));
        const mass = react.reduce((m, r) => m + r.n * IdealGas.species(r.key).rec.M, 0);
        const sys = { key, react, els, bv: els.map(e => b[e]), species, A, recs, lo, hi, mass, last: null };
        Chem.systems.set(key, sys);
        return sys;
    }
    // Equilibrium at T, P: the moles n_j (per the reactants as written)
    static solveTP(sys, T, P, fn) {
        if (!(T >= sys.lo && T <= sys.hi)) throw new Error(`${fn}(): T = ${+T.toPrecision(6)} K is outside ${sys.lo} to ${sys.hi} K, the range of the species data`);
        const R = IdealGas.R, ns = sys.species.length, ne = sys.els.length, A = sys.A, b0 = sys.bv;
        const g = sys.recs.map(sp => { const a = IdealGas._poly(sp, T, `${fn}()`); return IdealGas.hRT(a, T) - IdealGas.s0R(a, T) + Math.log(P / Chem.P0); });
        let ln = sys.last ? sys.last.ln.slice() : sys.species.map(() => Math.log(0.1 / ns)), lnN = sys.last ? sys.last.lnN : Math.log(0.1);
        for (let it = 0; it < 500; it++) {
            const n = ln.map(Math.exp), N = Math.exp(lnN), mu = ln.map((v, j) => g[j] + v - lnN);
            const M = Array.from({ length: ne + 1 }, () => new Array(ne + 2).fill(0));
            for (let k = 0; k < ne; k++) {
                for (let i = 0; i < ne; i++) { let s = 0; for (let j = 0; j < ns; j++) s += A[k][j] * A[i][j] * n[j]; M[k][i] = s; }
                let bk = 0, s2 = 0; for (let j = 0; j < ns; j++) { bk += A[k][j] * n[j]; s2 += A[k][j] * n[j] * mu[j]; }
                M[k][ne] = bk; M[k][ne + 1] = b0[k] - bk + s2;
            }
            let sn = 0, snm = 0; for (let j = 0; j < ns; j++) { sn += n[j]; snm += n[j] * mu[j]; }
            for (let i = 0; i < ne; i++) M[ne][i] = M[i][ne];
            M[ne][ne] = sn - N; M[ne][ne + 1] = N - sn + snm;
            const x = Chem.gauss(M, fn);
            const pi = x.slice(0, ne), dlnN = x[ne];
            const d = ln.map((v, j) => { let s = -mu[j] + dlnN; for (let i = 0; i < ne; i++) s += A[i][j] * pi[i]; return s; });
            // step control (Gordon and McBride, Eqs. 3.1 and 3.2)
            let big = 5 * Math.abs(dlnN), lam2 = 1;
            for (let j = 0; j < ns; j++) {
                if (ln[j] - lnN > -18.420681) big = Math.max(big, Math.abs(d[j]));
                else if (d[j] >= 0) lam2 = Math.min(lam2, Math.abs((-(ln[j] - lnN) - 9.2103404) / (d[j] - dlnN)));
            }
            const lam = Math.min(1, big > 0 ? 2 / big : 1, lam2);
            for (let j = 0; j < ns; j++) ln[j] = Math.max(ln[j] + lam * d[j], -1e4);
            lnN += lam * dlnN;
            let conv = Math.abs(dlnN) * N / sn <= 1e-12;
            for (let j = 0; j < ns && conv; j++) if (n[j] * Math.abs(d[j]) / sn > 1e-12) conv = false;
            if (conv && lam === 1) break;
            if (it === 499) throw new Error(`${fn}(): the equilibrium did not converge at T = ${T} K, P = ${P} Pa`);
        }
        sys.last = { ln: ln.slice(), lnN };
        const n = ln.map(Math.exp), N = n.reduce((a, v) => a + v, 0);
        let H = 0, S = 0;
        const lnNt = Math.log(N);
        sys.recs.forEach((sp, j) => { const a = IdealGas._poly(sp, T, `${fn}()`); H += n[j] * R * T * IdealGas.hRT(a, T); S += n[j] * R * (IdealGas.s0R(a, T) - (ln[j] - lnNt) - Math.log(P / Chem.P0)); });
        return { T, P, n, N, H, S };
    }
    static gauss(M, fn) {   // solves the augmented system in place, partial pivoting
        const m = M.length;
        for (let c = 0; c < m; c++) {
            let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
            if (!(Math.abs(M[p][c]) > 1e-300)) throw new Error(`${fn}(): the element balance cannot be solved (an element with no species to hold it?)`);
            [M[c], M[p]] = [M[p], M[c]];
            for (let r = 0; r < m; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= m; k++) M[r][k] -= f * M[c][k]; }
        }
        return M.map((r, i) => r[m] / r[i]);
    }
    static states = new Map();
    static equilibrium(a) {
        const fn = 'equilibrium';
        if (a.length < 6 || a.length % 2 !== 0) throw new Error("equilibrium(): use equilibrium('output', 'CH4 + 2 (O2 + 3.76 N2)', 'key1', v1, 'key2', v2), keys T, P, h, s or Tr, and optionally 'species', 'CO2 CO ...'");
        const o = String(a[0]).trim();
        const inp = {};
        let list = null;
        for (let i = 2; i < a.length; i += 2) {
            const k0 = String(a[i]).trim(), k = k0 === 'Tr' || k0 === 'tr' ? 'tr' : k0.toLowerCase();
            if (k === 'species') { list = String(a[i + 1]); continue; }
            if (!['t', 'p', 'h', 's', 'tr'].includes(k)) throw new Error(`equilibrium(): unknown input '${a[i]}'; the inputs are T, P, h, s and Tr (adiabatic, from the reactants at Tr), and 'species'`);
            if (k in inp) throw new Error(`equilibrium(): input '${a[i]}' is given twice`);
            inp[k] = ThermoEngine.num(a[i + 1], `equilibrium() value for '${a[i]}'`);
        }
        const sys = Chem.system(a[1], list, fn);
        if (!('p' in inp) || Object.keys(inp).length !== 2) throw new Error('equilibrium(): give P and one of T, h, s or Tr');
        if (!(inp.p > 0)) throw new Error(`equilibrium(): P = ${inp.p} Pa must be positive`);
        const ck = `${sys.key}|${JSON.stringify(inp)}`;
        let st = Chem.states.get(ck);
        if (!st) {
            const P = inp.p;
            if ('t' in inp) st = Chem.solveTP(sys, inp.t, P, fn);
            else {
                let target, prop = 'H';
                if ('tr' in inp) {
                    if (!(inp.tr >= sys.lo && inp.tr <= sys.hi)) throw new Error(`equilibrium(): Tr = ${inp.tr} K is outside ${sys.lo} to ${sys.hi} K`);
                    target = sys.react.reduce((s, r) => s + r.n * Chem.hs(r.key, inp.tr, fn).h, 0) / sys.mass;
                } else if ('h' in inp) target = inp.h;
                else { target = inp.s; prop = 'S'; }
                const f = (T) => Chem.solveTP(sys, T, P, fn)[prop] / sys.mass - target;
                const lo = sys.lo, hi = sys.hi, flo = f(lo), fhi = f(hi);
                if (!(flo <= 0 && fhi >= 0)) throw new Error(`equilibrium(): no temperature between ${lo} and ${hi} K gives this ${prop === 'H' ? 'enthalpy' : 'entropy'}`);
                const T = Mixtures.bracketed(f, lo, hi, flo, fhi, 1e-12 * Math.max(1, Math.abs(target)));
                st = Chem.solveTP(sys, T, P, fn);
            }
            Chem.states.set(ck, st); if (Chem.states.size > 500) Chem.states.delete(Chem.states.keys().next().value);
        }
        const R = IdealGas.R, m = sys.mass;
        const sm = /^([yn])_(.+)$/.exec(o);
        if (sm) {
            let key; try { key = IdealGas.species(sm[2]).key; } catch (e) { throw new Error(`equilibrium(): '${sm[2]}' is not one of the ideal-gas species`); }
            const j = sys.species.indexOf(key);
            if (j < 0) throw new Error(`equilibrium(): ${key} is not among the species of this equilibrium`);
            return sm[1] === 'y' ? st.n[j] / st.N : st.n[j];
        }
        const v = st.N * R * st.T / (st.P * m);
        const out = { t: st.T, p: st.P, h: st.H / m, s: st.S / m, v, u: st.H / m - st.P * v, m: m / st.N, n: st.N }[o.toLowerCase()];
        if (out === undefined) throw new Error(`equilibrium(): unknown output '${a[0]}'; use T, P, h, s, u, v, M, N (total moles), y_CO2 (a mole fraction) or n_CO2 (moles)`);
        return out;
    }
}

// Joule-Thomson coefficient and inversion temperature of a CoolProp fluid
const JouleThomson = {
    // below the triple-point pressure only vapor exists, and CoolProp is told so
    tk(f, P) { return P < ThermoEngine.CP.Props1SI(f, 'ptriple') ? 'T|gas' : 'T'; },
    mu(fluid, T, P) {
        const f = String(fluid).trim(), v = ThermoEngine.CP.PropsSI('d(T)/d(P)|Hmass', JouleThomson.tk(f, P), T, 'P', P, f);
        if (!Number.isFinite(v)) ThermoEngine.fail(ThermoEngine.CP, `the Joule-Thomson coefficient of '${fluid}' at T = ${T} K, P = ${P} Pa`);
        return v;
    },
    // the temperatures at P where mu = 0, found on a grid in ln T within one phase, then by bisection
    cache: new Map(),
    inversion(fluid, P, branch) {
        const ck = `${fluid}|${P}|${branch}`;
        if (JouleThomson.cache.has(ck)) return JouleThomson.cache.get(ck);
        const r = JouleThomson.search(fluid, P, branch);
        JouleThomson.cache.set(ck, r); if (JouleThomson.cache.size > 200) JouleThomson.cache.delete(JouleThomson.cache.keys().next().value);
        return r;
    },
    search(fluid, P, branch) {
        const CP = ThermoEngine.CP, f = String(fluid).trim();
        const Tmin = CP.Props1SI(f, 'Tmin'), Tmax = CP.Props1SI(f, 'Tmax'), Pc = CP.Props1SI(f, 'pcrit');
        const Ts = P < Pc && P >= CP.Props1SI(f, 'ptriple') ? CP.PropsSI('T', 'P', P, 'Q', 0, f) : null;
        const tk = JouleThomson.tk(f, P), val = (T) => { try { const v = CP.PropsSI('d(T)/d(P)|Hmass', tk, T, 'P', P, f); return Number.isFinite(v) ? v : NaN; } catch (e) { return NaN; } };
        const N = 600, grid = Array.from({ length: N + 1 }, (_, k) => Tmin * 1.0001 * Math.pow(Tmax / (Tmin * 1.0001), k / N));
        const roots = [];
        let T0 = grid[0], v0 = val(T0);
        for (let k = 1; k <= N; k++) {
            const T1 = grid[k], v1 = val(T1);
            if (Number.isFinite(v0) && Number.isFinite(v1) && v0 * v1 < 0 && !(Ts !== null && Ts > T0 && Ts < T1)) {
                let a = T0, b = T1, fa = v0;
                for (let it = 0; it < 100 && b - a > 1e-10 * b; it++) { const mI = (a + b) / 2, fm = val(mI); if ((fm < 0) === (fa < 0)) { a = mI; fa = fm; } else b = mI; }
                roots.push((a + b) / 2);
            }
            T0 = T1; v0 = v1;
        }
        if (!roots.length) throw new Error(`inversiontemperature(): '${f}' has no inversion temperature at P = ${P} Pa (above its maximum inversion pressure?)`);
        return branch === 'lower' ? roots[0] : roots[roots.length - 1];
    },
};

// ==========================================
// 2. THERMODYNAMIC PROPERTY ENGINE (COOLPROP)
// ==========================================
// One table drives everything: the functions available in equations, their SI result units (for the unit checker),
// and the reserved names. All values in and out are SI (K, Pa, J/kg, ...).
class ThermoEngine {
    // name: { key: CoolProp key, unit: SI unit of the result, kind, desc, argKey (sat only) }
    static FUNCS = {
        // --- state properties:  name(fluid, T, P)   or   name(fluid, 'key1', v1, 'key2', v2) ---
        enthalpy: { key: 'H', unit: 'J/kg', kind: 'state', desc: 'Specific enthalpy' },
        entropy: { key: 'S', unit: 'J/(kg K)', kind: 'state', desc: 'Specific entropy' },
        internalenergy: { key: 'U', unit: 'J/kg', kind: 'state', desc: 'Specific internal energy' },
        gibbsenergy: { key: 'G', unit: 'J/kg', kind: 'state', desc: 'Specific Gibbs energy' },
        // --- exergy:  name(fluid, T, P, T0, P0)   or   name(fluid, 'key1', v1, 'key2', v2, T0, P0); dead state = the same fluid at T0, P0 ---
        exergy: { key: '', unit: 'J/kg', kind: 'exergy', desc: 'Flow exergy, h - h0 - T0 (s - s0), dead state T0, P0' },
        exergy_nonflow: { key: '', unit: 'J/kg', kind: 'exergy', desc: 'Nonflow (closed-system) exergy, u - u0 + P0 (v - v0) - T0 (s - s0), dead state T0, P0' },
        helmholtzenergy: { key: 'Helmholtzmass', unit: 'J/kg', kind: 'state', desc: 'Specific Helmholtz energy' },
        density: { key: 'D', unit: 'kg/m^3', kind: 'state', desc: 'Density' },
        specificvolume: { key: 'V_SPEC', unit: 'm^3/kg', kind: 'state', desc: 'Specific volume (1/density)' },
        temperature: { key: 'T', unit: 'K', kind: 'state', desc: 'Temperature' },
        pressure: { key: 'P', unit: 'Pa', kind: 'state', desc: 'Pressure' },
        quality: { key: 'Q', unit: '', kind: 'state', desc: 'Vapor quality: 0 saturated liquid to 1 saturated vapor; -1 when single-phase' },
        specificheat: { key: 'Cpmass', unit: 'J/(kg K)', kind: 'state', desc: 'Specific heat at constant pressure, cp' },
        specificheatv: { key: 'Cvmass', unit: 'J/(kg K)', kind: 'state', desc: 'Specific heat at constant volume, cv' },
        specificheatideal: { key: 'Cp0mass', unit: 'J/(kg K)', kind: 'state', desc: 'Ideal-gas specific heat at constant pressure, cp0' },
        soundspeed: { key: 'A', unit: 'm/s', kind: 'state', desc: 'Speed of sound' },
        conductivity: { key: 'L', unit: 'W/(m K)', kind: 'state', desc: 'Thermal conductivity, k' },
        viscosity: { key: 'V', unit: 'Pa s', kind: 'state', desc: 'Dynamic viscosity, mu' },
        prandtl: { key: 'Prandtl', unit: '', kind: 'state', desc: 'Prandtl number' },
        thermaldiffusivity: { key: 'ALPHA', unit: 'm^2/s', kind: 'state', desc: 'Thermal diffusivity, k/(rho cp)' },
        kinematicviscosity: { key: 'NU', unit: 'm^2/s', kind: 'state', desc: 'Kinematic viscosity, mu/rho' },
        compressibilityfactor: { key: 'Z', unit: '', kind: 'state', desc: 'Compressibility factor, Z = P v / (R T)' },
        fugacitycoefficient: { key: 'PHI', unit: '', kind: 'state', desc: 'Fugacity coefficient phi = f/P, from ln(phi) = alpha_r + Z - 1 - ln(Z) (alpha_r: reduced residual Helmholtz energy); in two-phase states, that of either saturated phase' },
        fugacity: { key: 'FUG', unit: 'Pa', kind: 'state', desc: 'Fugacity f = phi P; in two-phase states, that of either saturated phase' },
        isothermalcompressibility: { key: 'isothermal_compressibility', unit: '1/Pa', kind: 'state', desc: 'Isothermal compressibility' },
        volumeexpansion: { key: 'isobaric_expansion_coefficient', unit: '1/K', kind: 'state', desc: 'Volumetric (isobaric) expansion coefficient, beta' },
        isentropicexponent: { key: 'isentropic_expansion_coefficient', unit: '', kind: 'state', desc: 'Isentropic expansion coefficient' },
        fundamentalderivative: { key: 'fundamental_derivative_of_gas_dynamics', unit: '', kind: 'state', desc: 'Fundamental derivative of gas dynamics' },
        phase: { key: 'Phase', unit: '', kind: 'state', desc: 'Phase index: 0 liquid, 1 supercritical, 2 supercritical gas, 3 supercritical liquid, 4 critical point, 5 gas, 6 two-phase' },
        enthalpymolar: { key: 'Hmolar', unit: 'J/mol', kind: 'state', desc: 'Molar enthalpy' },
        entropymolar: { key: 'Smolar', unit: 'J/(mol K)', kind: 'state', desc: 'Molar entropy' },
        internalenergymolar: { key: 'Umolar', unit: 'J/mol', kind: 'state', desc: 'Molar internal energy' },
        gibbsenergymolar: { key: 'Gmolar', unit: 'J/mol', kind: 'state', desc: 'Molar Gibbs energy' },
        specificheatmolar: { key: 'Cpmolar', unit: 'J/(mol K)', kind: 'state', desc: 'Molar heat capacity at constant pressure' },
        specificheatvmolar: { key: 'Cvmolar', unit: 'J/(mol K)', kind: 'state', desc: 'Molar heat capacity at constant volume' },
        molardensity: { key: 'Dmolar', unit: 'mol/m^3', kind: 'state', desc: 'Molar density' },
        // --- saturation helpers (give the fluid and ONE saturation variable) ---
        saturationtemperature: { key: 'T', unit: 'K', kind: 'sat', argKey: 'P', argUnit: 'Pa', desc: 'Saturation temperature at a pressure: saturationtemperature(fluid, P)' },
        saturationpressure: { key: 'P', unit: 'Pa', kind: 'sat', argKey: 'T', argUnit: 'K', desc: 'Saturation pressure at a temperature: saturationpressure(fluid, T)' },
        enthalpyvaporization: { key: 'H_VAP', unit: 'J/kg', kind: 'sat', desc: "Latent heat h_fg: enthalpyvaporization(fluid, 'T', T) or (fluid, 'P', P)" },
        surfacetension: { key: 'I', unit: 'N/m', kind: 'sat', argKey: 'T', argUnit: 'K', desc: 'Surface tension of the saturated liquid: surfacetension(fluid, T)' },
        meltingtemperature: { key: 'T', unit: 'K', kind: 'sat', argKey: 'P', argUnit: 'Pa', desc: "Melting temperature of ice Ih at a pressure (water only, IAPWS): meltingtemperature('water', P), from 611.657 Pa to 208.566 MPa" },
        meltingpressure: { key: 'P', unit: 'Pa', kind: 'sat', argKey: 'T', argUnit: 'K', desc: "Melting pressure of ice Ih at a temperature (water only, IAPWS): meltingpressure('water', T), from 251.165 to 273.16 K" },
        // --- fluid constants: name(fluid) ---
        criticaltemperature: { key: 'Tcrit', unit: 'K', kind: 'const', desc: 'Critical temperature' },
        criticalpressure: { key: 'pcrit', unit: 'Pa', kind: 'const', desc: 'Critical pressure' },
        criticaldensity: { key: 'rhocrit', unit: 'kg/m^3', kind: 'const', desc: 'Critical density' },
        triplepointtemperature: { key: 'Ttriple', unit: 'K', kind: 'const', desc: 'Triple-point temperature' },
        triplepointpressure: { key: 'ptriple', unit: 'Pa', kind: 'const', desc: 'Triple-point pressure' },
        meltingpoint: { key: '', unit: 'K', kind: 'solid', desc: "Melting point of a solid: meltingpoint('copper')" },
        mintemperature: { key: 'Tmin', unit: 'K', kind: 'const', desc: 'Minimum temperature of the equation of state' },
        maxtemperature: { key: 'Tmax', unit: 'K', kind: 'const', desc: 'Maximum temperature of the equation of state' },
        maxpressure: { key: 'pmax', unit: 'Pa', kind: 'const', desc: 'Maximum pressure of the equation of state' },
        molarmass: { key: 'molar_mass', unit: 'kg/mol', kind: 'const', desc: 'Molar mass (kg per mol)' },
        acentricfactor: { key: 'acentric', unit: '', kind: 'const', desc: 'Acentric factor' },
        gasconstant: { key: 'gas_constant', unit: 'J/(mol K)', kind: 'const', desc: 'Universal gas constant, 8.314 J/(mol K)' },
        gwp20: { key: 'GWP20', unit: '', kind: 'const', desc: 'Global warming potential, 20-year horizon (refrigerants)' },
        gwp100: { key: 'GWP100', unit: '', kind: 'const', desc: 'Global warming potential, 100-year horizon (refrigerants)' },
        gwp500: { key: 'GWP500', unit: '', kind: 'const', desc: 'Global warming potential, 500-year horizon (refrigerants)' },
        odp: { key: 'ODP', unit: '', kind: 'const', desc: 'Ozone depletion potential (refrigerants)' },
        ...IG_FUNCS,
        // --- LiBr-H2O solutions (Patek and Klomfar 2006); x = LiBr mass fraction, T in K, P in Pa ---
        libr_pressure: { key: '', unit: 'Pa', kind: 'libr', argUnits: ['K', ''], desc: 'Equilibrium (water vapor) pressure of a LiBr-H2O solution: libr_pressure(T, x)' },
        libr_temperature: { key: '', unit: 'K', kind: 'libr', argUnits: ['Pa', ''], desc: 'Equilibrium temperature of a LiBr-H2O solution: libr_temperature(P, x)' },
        libr_concentration: { key: '', unit: '', kind: 'libr', argUnits: ['K', 'Pa'], desc: 'LiBr mass fraction of a solution in equilibrium at T and P: libr_concentration(T, P)' },
        libr_enthalpy: { key: '', unit: 'J/kg', kind: 'libr', argUnits: ['K', ''], desc: 'Specific enthalpy of a LiBr-H2O solution (same reference as water and steam): libr_enthalpy(T, x)' },
        libr_entropy: { key: '', unit: 'J/(kg K)', kind: 'libr', argUnits: ['K', ''], desc: 'Specific entropy of a LiBr-H2O solution: libr_entropy(T, x)' },
        libr_cp: { key: '', unit: 'J/(kg K)', kind: 'libr', argUnits: ['K', ''], desc: 'Specific heat of a LiBr-H2O solution: libr_cp(T, x)' },
        libr_density: { key: '', unit: 'kg/m^3', kind: 'libr', argUnits: ['K', ''], desc: 'Density of a LiBr-H2O solution: libr_density(T, x)' },
        // --- ammonia-water mixtures (Ibrahim and Klein 1993: see the NH3H2O class) ---
        nh3h2o: { key: '', unit: '', kind: 'nh3', desc: "Ammonia-water mixture (Ibrahim and Klein): nh3h2o('output', 'key1', v1, 'key2', v2, 'key3', v3); keys T, P, x (NH3 mass fraction), q, h; outputs T, P, x, h, s, u, v, q, xl, yv" },
        // --- U.S. Standard Atmosphere 1976, -5 to 86 km ---
        atmosphere: { key: '', unit: '', kind: 'atm', desc: "U.S. Standard Atmosphere 1976 at geometric altitude z in m (-5 to 86 km): atmosphere('output', z); outputs T, P, rho, c, mu, k, nu, g, H (geopotential altitude)" },
        atmosphere_altitude: { key: '', unit: 'm', kind: 'atm', desc: "Geometric altitude of the standard atmosphere where the pressure or the density has a value: atmosphere_altitude('P', P) or ('rho', rho)" },
        // --- mixtures of CoolProp's pure fluids, by mole fraction: see the Mixtures class ---
        mixture: { key: '', unit: '', kind: 'mix', desc: "Mixture by CoolProp's equation of state, for fluids whose every pair has parameters in CoolProp: mixture('output', 'ethanol&water', 'key1', v1, 'key2', v2, 'key3', v3); keys T, P, x (mole fraction of the first fluid, or an array), q (molar vapor fraction), h; outputs T, P, x, q, h, s, u, v, M, xl, yv" },
        gammamixture: { key: '', unit: '', kind: 'mix', desc: "Mixture by modified Raoult's law with activity coefficients: gammamixture('output', 'ethanol&water', 'model', [parameters], 'key1', v1, 'key2', v2, 'key3', v3); models margules, vanlaar, wilson, nrtl; keys and outputs as mixture()" },
        pseudocritical: { key: '', unit: '', kind: 'mix', desc: "Kay's rule: pseudocritical('Tc', 'nitrogen&CO2', x) for Tc, Pc or omega of a mixture, mole-fraction averages, for the lk_ functions" },
        idealmixture: { key: '', unit: '', kind: 'mix', desc: "Ideal mixture (Raoult's law) of any of CoolProp's pure fluids: idealmixture('output', 'benzene&toluene', 'key1', v1, 'key2', v2, 'key3', v3); keys and outputs as mixture()" },
        molefraction: { key: '', unit: '', kind: 'mix', desc: "Mole fraction from mass fractions: molefraction('ethanol&water', w) for the first fluid, or molefraction('a&b&c', [w1, w2, w3], i)" },
        massfraction: { key: '', unit: '', kind: 'mix', desc: "Mass fraction from mole fractions: massfraction('ethanol&water', x) for the first fluid, or massfraction('a&b&c', [x1, x2, x3], i)" },
        // --- reactions and chemical equilibrium of ideal gases: see the Chem class ---
        reaction: { key: '', unit: '', kind: 'chem', desc: "Reaction properties at T and 1 bar: reaction('output', 'H2 + 0.5 O2 -> H2O(l)', 'T', T); outputs dH, dS, dG (per reaction as written), lnK, K, and E0 with 'n', electrons" },
        equilibrium: { key: '', unit: '', kind: 'chem', desc: "Chemical equilibrium of ideal gases (Gibbs minimization): equilibrium('output', 'CH4 + 2 (O2 + 3.76 N2)', 'key1', v1, 'key2', v2); keys P and one of T, h, s, Tr (adiabatic from reactants at Tr), optional 'species'; outputs T, P, h, s, u, v, M, N, y_X, n_X" },
        // --- Joule-Thomson coefficient and inversion ---
        joulethomson: { key: '', unit: 'K/Pa', kind: 'jt', desc: "Joule-Thomson coefficient (dT/dP at constant h) of a CoolProp fluid: joulethomson(fluid, T, P)" },
        inversiontemperature: { key: '', unit: 'K', kind: 'jt', desc: "Joule-Thomson inversion temperature at P: inversiontemperature(fluid, P) for the upper one, or (fluid, P, 'lower')" },
        // --- solutions of a nonvolatile solute, ideal: see the Solutions class ---
        solution: { key: '', unit: '', kind: 'sol', desc: "Ideal solution of a nonvolatile solute: solution('output', 'NaCl&water', 'key1', v1, 'key2', v2); keys T, P, w (solute mass fraction) or m (molality); outputs P (vapor pressure), T (boiling point), dT, Tf (freezing point, water), dTf, Pi (osmotic pressure), aw, m, w" },
        // --- seawater at 1 atm (Sharqawy et al. 2010) and the ocean's pressure and depth (UNESCO 1983): see the Seawater class ---
        seawater: { key: '', unit: '', kind: 'sea', desc: "Seawater at atmospheric pressure (Sharqawy et al. 2010): seawater('output', T, S), T 273.15 to 393.15 K, S the salinity in kg/kg (0 to 0.12); outputs rho, cp, k, mu, nu, alpha, Pr, BPE (boiling-point elevation); and from TEOS-10, seawater('output', T, S[, P]) with T up to 353.15 K: h, s, g, muw (chemical potential of water), aw (water activity), phi (osmotic coefficient), Pi (osmotic pressure)" },
        oceandepth: { key: '', unit: 'm', kind: 'sea', desc: 'Depth of the standard ocean (UNESCO 1983) at absolute pressure P (Pa) and latitude lat (rad): oceandepth(P, lat)' },
        oceanpressure: { key: '', unit: 'Pa', kind: 'sea', desc: 'Absolute pressure of the standard ocean (UNESCO 1983) at depth z (m) and latitude lat (rad): oceanpressure(z, lat)' },
        // --- general access to everything else CoolProp offers ---
        props: { key: '', unit: '', kind: 'props', desc: "props('output', fluid, 'key1', v1, 'key2', v2): any CoolProp output parameter" },
        props1: { key: '', unit: '', kind: 'props1', desc: "props1('output', fluid): any CoolProp fluid constant" },
        humidair: { key: '', unit: '', kind: 'ha', desc: "humidair('output', 'key1', v1, 'key2', v2, 'key3', v3): psychrometric properties of humid air" }
    };
    // name -> CoolProp key (other code uses this to recognize and reserve the function names)
    static propKeys = Object.fromEntries(Object.entries(ThermoEngine.FUNCS).map(([n, f]) => [n, f.key]));
    static allNames() { return Object.keys(ThermoEngine.FUNCS); }

    static get CP() {
        if (!window.CoolPropReady || !window.CoolProp) {
            throw new Error('CoolProp is not loaded (still downloading its WASM file, or the CDN failed). Check the status badge.');
        }
        return window.CoolProp;
    }
    static fail(CP, what) {
        throw new Error(`CoolProp: ${CP.get_global_param_string('errstring') || 'calculation failed'} (${what})`);
    }
    static num(x, what) {
        const v = Number(x);
        if (typeof x === 'object' || !Number.isFinite(v)) throw new Error(`${what}: a number was expected, got '${x}'`);
        return v;
    }
    // Friendly input-key names -> CoolProp keys. specific volume is converted to density by the caller.
    static canonKey(k) {
        const s = String(k).trim(), l = s.toLowerCase();
        const alias = {
            temperature: 'T', t: 'T', pressure: 'P', p: 'P', enthalpy: 'H', h: 'H', entropy: 'S', s: 'S',
            density: 'D', d: 'D', internalenergy: 'U', u: 'U', quality: 'Q', x: 'Q', q: 'Q', specificvolume: 'V_SPEC', v: 'V_SPEC'
        };
        return alias[l] || s;
    }
    // [T, P] shorthand or 2 keyed pairs  ->  [key1, value1, key2, value2]
    static inputs(name, args) {
        let a;
        if (args.length === 2) a = ['T', args[0], 'P', args[1]];
        else if (args.length === 4) a = args;
        else throw new Error(`${name}(): use (fluid, T, P) or (fluid, 'key1', value1, 'key2', value2)`);
        const out = [];
        for (let i = 0; i < 4; i += 2) {
            let k = ThermoEngine.canonKey(a[i]), v = ThermoEngine.num(a[i + 1], `${name}() value for '${k}'`);
            if (k === 'V_SPEC') { k = 'D'; v = 1 / v; }
            out.push(k, v);
        }
        return out;
    }

    static call(name, a) {
        const spec = ThermoEngine.FUNCS[name];
        // Solids (solids.js): conductivity('copper', T) and the like, and meltingpoint('copper')
        if (spec.kind === 'solid' && a.length === 1 && WaterBelowTriple.is(a[0])) return IceIh.Tmelt(101325);   // meltingpoint('ice'): at 1 atm
        if (spec.kind === 'solid' || (spec.kind === 'state' && a.length && Solids.get(a[0]))) {
            if (!Solids.get(a[0])) throw new Error(`${name}(): '${a[0]}' is not one of the solids (see Solid properties in Help)`);
            return Solids.call(name, a);
        }
        if (spec.kind === 'phys') return IdealGas.constant(a);   // these two need no CoolProp
        if (spec.kind === 'ig' || spec.kind === 'igmix') return IdealGas.evaluate(name, a);
        if (spec.kind === 'libr') return LiBrH2O.evaluate(name, a);
        if (spec.kind === 'nh3') return NH3H2O.evaluate(a);
        if (spec.kind === 'atm') return StdAtmosphere.evaluate(name, a);
        if (spec.kind === 'sea') return Seawater.evaluate(name, a);
        if (spec.kind === 'sol') return Solutions.evaluate(a);
        if (spec.kind === 'mix') return (name === 'molefraction' || name === 'massfraction') ? Mixtures.convert(name, a) : name === 'pseudocritical' ? Mixtures.pseudo(a) : Mixtures.evaluate(name, a);
        if (spec.kind === 'chem') return name === 'reaction' ? Chem.reaction(a) : Chem.equilibrium(a);
        if (spec.kind === 'jt') {
            if (name === 'joulethomson') { if (a.length !== 3) throw new Error('joulethomson(): use joulethomson(fluid, T, P)'); return JouleThomson.mu(a[0], ThermoEngine.num(a[1], 'joulethomson() T'), ThermoEngine.num(a[2], 'joulethomson() P')); }
            if (a.length !== 2 && a.length !== 3) throw new Error("inversiontemperature(): use inversiontemperature(fluid, P) or (fluid, P, 'lower')");
            const br = a.length === 3 ? String(a[2]).trim().toLowerCase() : 'upper';
            if (br !== 'upper' && br !== 'lower') throw new Error("inversiontemperature(): the third argument is 'upper' or 'lower'");
            return JouleThomson.inversion(a[0], ThermoEngine.num(a[1], 'inversiontemperature() P'), br);
        }
        if (spec.kind === 'exergy') {   // physical exergy relative to the same fluid at T0, P0, through the property functions above
            if (a.length !== 5 && a.length !== 7) throw new Error(`${name}(): use ${name}(fluid, T, P, T0, P0) or ${name}(fluid, 'key1', v1, 'key2', v2, T0, P0)`);
            const T0 = ThermoEngine.num(a[a.length - 2], `${name}() T0`), P0 = ThermoEngine.num(a[a.length - 1], `${name}() P0`);
            if (!(T0 > 0 && P0 > 0)) throw new Error(`${name}(): T0 and P0 must be positive (K and Pa)`);
            const st = a.slice(1, -2), at = (p, s) => ThermoEngine.call(p, [a[0], ...s]), dead = [T0, P0];
            const ds = at('entropy', st) - at('entropy', dead);
            if (name === 'exergy') return at('enthalpy', st) - at('enthalpy', dead) - T0 * ds;
            return at('internalenergy', st) - at('internalenergy', dead) + P0 * (at('specificvolume', st) - at('specificvolume', dead)) - T0 * ds;
        }
        const CP = ThermoEngine.CP;
        const check = (v, what) => { if (!Number.isFinite(v)) ThermoEngine.fail(CP, what); return v; };
        const need = (ok, msg) => { if (!ok) throw new Error(`${name}(): ${msg}`); };

        if (spec.kind === 'ha') {
            need(a.length === 7, "use humidair('output', 'key1', v1, 'key2', v2, 'key3', v3)");
            return check(CP.HAPropsSI(String(a[0]), String(a[1]), ThermoEngine.num(a[2], name), String(a[3]), ThermoEngine.num(a[4], name),
                String(a[5]), ThermoEngine.num(a[6], name)), `humidair '${a[0]}'`);
        }
        if (spec.kind === 'props1') {
            need(a.length === 2, "use props1('output', fluid)");
            return check(CP.Props1SI(String(a[0]), String(a[1]).trim()), `props1 '${a[0]}' of '${a[1]}'`);
        }
        if (spec.kind === 'props') {
            need(a.length === 6, "use props('output', fluid, 'key1', v1, 'key2', v2)");
            const [k1, v1, k2, v2] = ThermoEngine.inputs(name, a.slice(2));
            if (WaterBelowTriple.is(a[1])) {
                const st = WaterBelowTriple.state(CP, k1, v1, k2, v2);
                if (st) return st.get(WaterBelowTriple.outKey(String(a[0])));
                return check(CP.PropsSI(String(a[0]), k1, v1, k2, v2, 'Water'), `props '${a[0]}' of water`);
            }
            return check(CP.PropsSI(String(a[0]), k1, v1, k2, v2, String(a[1]).trim()), `props '${a[0]}' of '${a[1]}'`);
        }

        need(a.length >= 1, 'the first argument must be the fluid name');
        let fluid = String(a[0]).trim(), rest = a.slice(1);
        const water = WaterBelowTriple.is(fluid);
        if (water) {
            fluid = 'Water';                                                     // 'ice' is water: all phases
            if (String(a[0]).trim().toLowerCase() === 'ice' && rest.length === 1 && spec.kind === 'state') rest = [rest[0], 101325];   // conductivity('ice', T): 1 atm
        }

        if (spec.kind === 'const') {
            need(rest.length === 0, 'takes only the fluid name');
            return check(CP.Props1SI(spec.key, fluid), `${name} of '${fluid}'`);
        }

        if (name === 'meltingtemperature' || name === 'meltingpressure') {
            need(water, "available for water only (IAPWS R14-08); for solids use meltingpoint('copper')");
            const v = ThermoEngine.num(rest.length === 2 ? rest[1] : rest[0], name);
            if (name === 'meltingtemperature') { need(v >= IceIh.pt && v <= IceIh.pIII, `P = ${v} Pa is outside the melting curve of ice Ih, 611.657 Pa to 208.566 MPa`); return IceIh.Tmelt(v); }
            need(v >= IceIh.TIII && v <= IceIh.Tt, `T = ${v} K is outside the melting curve of ice Ih, 251.165 to 273.16 K`); return IceIh.pmelt(v);
        }
        if (spec.kind === 'sat') {
            let key, val;
            if (rest.length === 1 && spec.argKey) { key = spec.argKey; val = ThermoEngine.num(rest[0], name); }
            else if (rest.length === 2) { key = ThermoEngine.canonKey(rest[0]); val = ThermoEngine.num(rest[1], name); }
            else throw new Error(`${name}(): ${spec.desc}`);
            const q = (out, x) => check(CP.PropsSI(out, key, val, 'Q', x, fluid), `${name} of '${fluid}'`);
            if (water && ((key === 'T' && val < IceIh.Tt) || (key === 'P' && val < IceIh.pt))) {   // below the triple point: sublimation
                const T = key === 'T' ? val : IceIh.Tsub(val), p = key === 'P' ? val : IceIh.psub(val);
                if (name === 'saturationtemperature') { need(key === 'P', "give a pressure"); return T; }
                if (name === 'saturationpressure') { need(key === 'T', "give a temperature"); return p; }
                need(name === 'enthalpyvaporization', 'below the triple point (273.16 K, 611.657 Pa) water sublimates: there is no liquid surface');
                return WaterBelowTriple.fluid(CP, T, p, false).get('H') - WaterBelowTriple.ice(T, p).get('H');   // enthalpy of sublimation
            }
            if (name === 'saturationtemperature') { need(key === 'P', "give a pressure"); return q('T', 0); }
            if (name === 'saturationpressure') { need(key === 'T', "give a temperature"); return q('P', 0); }
            need(key === 'T' || key === 'P', "the saturation variable must be 'T' or 'P'");
            if (name === 'surfacetension') return q('I', 0);
            return q('H', 1) - q('H', 0);                               // enthalpyvaporization
        }

        const [k1, v1, k2, v2] = ThermoEngine.inputs(name, rest);
        if (water) {   // ice, sublimation and vapor below the triple point (above it, CoolProp as usual)
            const st = WaterBelowTriple.state(CP, k1, v1, k2, v2);
            if (st && (spec.key === 'PHI' || spec.key === 'FUG')) throw new Error(`${name}(): not available for ice or for water vapor below the triple point (273.16 K, 611.657 Pa)`);
            if (st) return st.get(spec.key);
        }
        const get = (out) => check(CP.PropsSI(out, k1, v1, k2, v2, fluid), `${name} of '${fluid}'`);
        if (spec.key === 'PHI' || spec.key === 'FUG') {   // the same in both saturated phases, so a two-phase state takes the liquid's
            const q = get('Q'), T = get('T'), P = get('P');
            const at = (out) => q > 0 && q < 1 ? check(CP.PropsSI(out, 'T', T, 'Q', 0, fluid), `${name} of '${fluid}'`) : get(out);
            const Z = at('Z'), phi = Math.exp(at('alphar') + Z - 1 - Math.log(Z));
            return spec.key === 'PHI' ? phi : phi * P;
        }
        switch (spec.key) {
            case 'V_SPEC': return 1 / get('D');
            case 'ALPHA': return get('L') / (get('D') * get('Cpmass'));
            case 'NU': return get('V') / get('D');
            default: return get(spec.key);
        }
    }
    static evaluate(propName, fluidName, ...args) { return ThermoEngine.call(propName.toLowerCase(), [fluidName, ...args]); }
}

