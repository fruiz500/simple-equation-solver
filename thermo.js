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
        if (args.length < 1) throw new Error(`${name}(): the first argument is the species, for example ${name}('CO2', T)`);
        const sp = IdealGas.species(args[0]);
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
        return { T, P: p, Q: -1, G: G.g, S: -G.gT, H: G.g - T * G.gT, U: G.g - T * G.gT - p * G.gp, Helmholtzmass: G.g - p * G.gp, D: 1 / v, V_SPEC: v,
            Cpmass: cp, Cvmass: cp - T * v * alpha * alpha / kT, isobaric_expansion_coefficient: alpha, isothermal_compressibility: kT, L: k, ALPHA: k * G.gp / cp, Phase: 9,
            Hmolar: (G.g - T * G.gT) * M, Smolar: -G.gT * M, Umolar: (G.g - T * G.gT - p * G.gp) * M, Gmolar: G.g * M, Cpmolar: cp * M, Cvmolar: (cp - T * v * alpha * alpha / kT) * M, Dmolar: 1 / (v * M) };
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
        const m = { h: 'H', hmass: 'H', s: 'S', smass: 'S', u: 'U', umass: 'U', g: 'G', gmass: 'G', d: 'D', dmass: 'D', t: 'T', p: 'P', q: 'Q', c: 'Cpmass', cpmass: 'Cpmass', o: 'Cvmass', cvmass: 'Cvmass',
            l: 'L', conductivity: 'L', helmholtzmass: 'Helmholtzmass', hmolar: 'Hmolar', smolar: 'Smolar', umolar: 'Umolar', gmolar: 'Gmolar', cpmolar: 'Cpmolar', cvmolar: 'Cvmolar', dmolar: 'Dmolar',
            isobaric_expansion_coefficient: 'isobaric_expansion_coefficient', isothermal_compressibility: 'isothermal_compressibility', phase: 'Phase' };
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
        if (spec.kind === 'ig') return IdealGas.evaluate(name, a);
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
            if (st) return st.get(spec.key);
        }
        const get = (out) => check(CP.PropsSI(out, k1, v1, k2, v2, fluid), `${name} of '${fluid}'`);
        switch (spec.key) {
            case 'V_SPEC': return 1 / get('D');
            case 'ALPHA': return get('L') / (get('D') * get('Cpmass'));
            case 'NU': return get('V') / get('D');
            default: return get(spec.key);
        }
    }
    static evaluate(propName, fluidName, ...args) { return ThermoEngine.call(propName.toLowerCase(), [fluidName, ...args]); }
}

