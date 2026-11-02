// Simple Equation Solver. Copyright (C) 2026 Francisco Ruiz.
// SPDX-License-Identifier: GPL-3.0-or-later. Free software under the GNU General Public License v3 or later; no warranty. See LICENSE.
// Solid properties: density, specific heat, thermal conductivity, thermal diffusivity and melting point of 198 solids.
// Data extracted from F. P. Incropera, D. P. DeWitt, T. L. Bergman, A. S. Lavine, Fundamentals of Heat and Mass Transfer,
// 6th ed., Wiley, 2007, Appendix A, Tables A.1 (metallic solids), A.2 (nonmetallic solids) and A.3 (common materials),
// values as printed (src gives the table and page). Fields: rho = density (kg/m3, at 300 K unless a note says otherwise),
// Tm = melting point (K), k = [[T (K), W/(m K)], ...], cp = [[T (K), J/(kg K)], ...]. Between tabulated temperatures
// values are interpolated linearly, as in the textbook; outside the tabulated range it is an error.
const SOLIDS_DB = {
    aluminum: { name: "Aluminum, pure", src: "Table A.1, p. 929", rho: 2702, Tm: 933, k: [[100, 302], [200, 237], [300, 237], [400, 240], [600, 231], [800, 218]], cp: [[100, 482], [200, 798], [300, 903], [400, 949], [600, 1033], [800, 1146]], aliases: ["aluminium", "Al"] },
    aluminum_2024_t6: { name: "Aluminum alloy 2024-T6 (4.5% Cu, 1.5% Mg, 0.6% Mn)", src: "Table A.1, p. 929", rho: 2770, Tm: 775, k: [[100, 65], [200, 163], [300, 177], [400, 186], [600, 186]], cp: [[100, 473], [200, 787], [300, 875], [400, 925], [600, 1042]], aliases: ["Al2024", "Al 2024-T6", "2024-T6"] },
    aluminum_195_cast: { name: "Aluminum alloy 195, cast (4.5% Cu)", src: "Table A.1, p. 929", rho: 2790, k: [[300, 168], [400, 174], [600, 185]], cp: [[300, 883]], aliases: ["Al195"] },
    beryllium: { name: "Beryllium", src: "Table A.1, p. 929", rho: 1850, Tm: 1550, k: [[100, 990], [200, 301], [300, 200], [400, 161], [600, 126], [800, 106], [1000, 90.8], [1200, 78.7]], cp: [[100, 203], [200, 1114], [300, 1825], [400, 2191], [600, 2604], [800, 2823], [1000, 3018], [1200, 3227], [1500, 3519]], aliases: ["Be"] },
    bismuth: { name: "Bismuth", src: "Table A.1, p. 929", rho: 9780, Tm: 545, k: [[100, 16.5], [200, 9.69], [300, 7.86], [400, 7.04]], cp: [[100, 112], [200, 120], [300, 122], [400, 127]], aliases: ["Bi"] },
    boron: { name: "Boron", src: "Table A.1, p. 929", rho: 2500, Tm: 2573, k: [[100, 190], [200, 55.5], [300, 27], [400, 16.8], [600, 10.6], [800, 9.6], [1000, 9.85]], cp: [[100, 128], [200, 600], [300, 1107], [400, 1463], [600, 1892], [800, 2160], [1000, 2338]], aliases: ["B"] },
    cadmium: { name: "Cadmium", src: "Table A.1, p. 929", rho: 8650, Tm: 594, k: [[100, 203], [200, 99.3], [300, 96.8], [400, 94.7]], cp: [[100, 198], [200, 222], [300, 231], [400, 242]], aliases: ["Cd"] },
    chromium: { name: "Chromium", src: "Table A.1, p. 929", rho: 7160, Tm: 2118, k: [[100, 159], [200, 111], [300, 93.7], [400, 90.9], [600, 80.7], [800, 71.3], [1000, 65.4], [1200, 61.9], [1500, 57.2], [2000, 49.4]], cp: [[100, 192], [200, 384], [300, 449], [400, 484], [600, 542], [800, 581], [1000, 616], [1200, 682], [1500, 779], [2000, 937]], aliases: ["Cr"] },
    cobalt: { name: "Cobalt", src: "Table A.1, p. 929", rho: 8862, Tm: 1769, k: [[100, 167], [200, 122], [300, 99.2], [400, 85.4], [600, 67.4], [800, 58.2], [1000, 52.1], [1200, 49.3], [1500, 42.5]], cp: [[100, 236], [200, 379], [300, 421], [400, 450], [600, 503], [800, 550], [1000, 628], [1200, 733], [1500, 674]], aliases: ["Co"] },
    copper: { name: "Copper, pure", src: "Table A.1, p. 929", rho: 8933, Tm: 1358, k: [[100, 482], [200, 413], [300, 401], [400, 393], [600, 379], [800, 366], [1000, 352], [1200, 339]], cp: [[100, 252], [200, 356], [300, 385], [400, 397], [600, 417], [800, 433], [1000, 451], [1200, 480]], aliases: ["Cu"] },
    bronze_commercial: { name: "Commercial bronze (90% Cu, 10% Al)", src: "Table A.1, p. 929", rho: 8800, Tm: 1293, k: [[200, 42], [300, 52], [400, 52], [600, 59]], cp: [[200, 785], [300, 420], [400, 460], [600, 545]], note: "cp at 200 K is printed as 785 J/(kg K), above the 420 at 300 K: probably a misprint in the book", aliases: ["commercial bronze"] },
    bronze_phosphor_gear: { name: "Phosphor gear bronze (89% Cu, 11% Sn)", src: "Table A.1, p. 929", rho: 8780, Tm: 1104, k: [[200, 41], [300, 54], [400, 65], [600, 74]], cp: [[300, 355]], aliases: ["phosphor bronze"] },
    brass_cartridge: { name: "Cartridge brass (70% Cu, 30% Zn)", src: "Table A.1, p. 929", rho: 8530, Tm: 1188, k: [[100, 75], [200, 95], [300, 110], [400, 137], [600, 149]], cp: [[200, 360], [300, 380], [400, 395], [600, 425]], aliases: ["brass", "cartridge brass"] },
    constantan: { name: "Constantan (55% Cu, 45% Ni)", src: "Table A.1, p. 929", rho: 8920, Tm: 1493, k: [[100, 17], [200, 19], [300, 23]], cp: [[100, 237], [200, 362], [300, 384]] },
    germanium: { name: "Germanium", src: "Table A.1, p. 929", rho: 5360, Tm: 1211, k: [[100, 232], [200, 96.8], [300, 59.9], [400, 43.2], [600, 27.3], [800, 19.8], [1000, 17.4], [1200, 17.4]], cp: [[100, 190], [200, 290], [300, 322], [400, 337], [600, 348], [800, 357], [1000, 375], [1200, 395]], aliases: ["Ge"] },
    gold: { name: "Gold", src: "Table A.1, p. 930", rho: 19300, Tm: 1336, k: [[100, 327], [200, 323], [300, 317], [400, 311], [600, 298], [800, 284], [1000, 270], [1200, 255]], cp: [[100, 109], [200, 124], [300, 129], [400, 131], [600, 135], [800, 140], [1000, 145], [1200, 155]], aliases: ["Au"] },
    iridium: { name: "Iridium", src: "Table A.1, p. 930", rho: 22500, Tm: 2720, k: [[100, 172], [200, 153], [300, 147], [400, 144], [600, 138], [800, 132], [1000, 126], [1200, 120], [1500, 111]], cp: [[100, 90], [200, 122], [300, 130], [400, 133], [600, 138], [800, 144], [1000, 153], [1200, 161], [1500, 172]], aliases: ["Ir"] },
    iron: { name: "Iron, pure", src: "Table A.1, p. 930", rho: 7870, Tm: 1810, k: [[100, 134], [200, 94], [300, 80.2], [400, 69.5], [600, 54.7], [800, 43.3], [1000, 32.8], [1200, 28.3], [1500, 32.1]], cp: [[100, 216], [200, 384], [300, 447], [400, 490], [600, 574], [800, 680], [1000, 975], [1200, 609], [1500, 654]], aliases: ["Fe"] },
    iron_armco: { name: "Armco iron (99.75% pure)", src: "Table A.1, p. 930", rho: 7870, k: [[100, 95.6], [200, 80.6], [300, 72.7], [400, 65.7], [600, 53.1], [800, 42.2], [1000, 32.3], [1200, 28.7], [1500, 31.4]], cp: [[100, 215], [200, 384], [300, 447], [400, 490], [600, 574], [800, 680], [1000, 975], [1200, 609], [1500, 654]], aliases: ["Armco"] },
    steel_plain_carbon: { name: "Plain carbon steel (Mn <= 1%, Si <= 0.1%)", src: "Table A.1, p. 930", rho: 7854, k: [[300, 60.5], [400, 56.7], [600, 48], [800, 39.2], [1000, 30]], cp: [[300, 434], [400, 487], [600, 559], [800, 685], [1000, 1169]], aliases: ["plain carbon steel", "carbon steel"] },
    aisi_1010: { name: "AISI 1010 carbon steel", src: "Table A.1, p. 930", rho: 7832, k: [[300, 63.9], [400, 58.7], [600, 48.8], [800, 39.2], [1000, 31.3]], cp: [[300, 434], [400, 487], [600, 559], [800, 685], [1000, 1168]], aliases: ["steel 1010"] },
    steel_carbon_silicon: { name: "Carbon-silicon steel (Mn <= 1%, 0.1% < Si <= 0.6%)", src: "Table A.1, p. 930", rho: 7817, k: [[300, 51.9], [400, 49.8], [600, 44], [800, 37.4], [1000, 29.3]], cp: [[300, 446], [400, 501], [600, 582], [800, 699], [1000, 971]] },
    steel_carbon_manganese_silicon: { name: "Carbon-manganese-silicon steel (1% < Mn <= 1.65%, 0.1% < Si <= 0.6%)", src: "Table A.1, p. 930", rho: 8131, k: [[300, 41], [400, 42.2], [600, 39.7], [800, 35], [1000, 27.6]], cp: [[300, 434], [400, 487], [600, 559], [800, 685], [1000, 1090]] },
    steel_cr_mo_si: { name: "1/2 Cr-1/4 Mo-Si steel (0.18% C, 0.65% Cr, 0.23% Mo, 0.6% Si)", src: "Table A.1, p. 930", rho: 7822, k: [[300, 37.7], [400, 38.2], [600, 36.7], [800, 33.3], [1000, 26.9]], cp: [[300, 444], [400, 492], [600, 575], [800, 688], [1000, 969]] },
    steel_1cr_mo: { name: "1 Cr-1/2 Mo steel (0.16% C, 1% Cr, 0.54% Mo, 0.39% Si)", src: "Table A.1, p. 930", rho: 7858, k: [[300, 42.3], [400, 42], [600, 39.1], [800, 34.5], [1000, 27.4]], cp: [[300, 442], [400, 492], [600, 575], [800, 688], [1000, 969]] },
    steel_1cr_v: { name: "1 Cr-V steel (0.2% C, 1.02% Cr, 0.15% V)", src: "Table A.1, p. 930", rho: 7836, k: [[300, 48.9], [400, 46.8], [600, 42.1], [800, 36.3], [1000, 28.2]], cp: [[300, 443], [400, 492], [600, 575], [800, 688], [1000, 969]] },
    aisi_302: { name: "AISI 302 stainless steel", src: "Table A.1, p. 931", rho: 8055, k: [[300, 15.1], [400, 17.3], [600, 20], [800, 22.8], [1000, 25.4]], cp: [[300, 480], [400, 512], [600, 559], [800, 585], [1000, 606]], aliases: ["stainless 302"] },
    aisi_304: { name: "AISI 304 stainless steel", src: "Table A.1, p. 931", rho: 7900, Tm: 1670, k: [[100, 9.2], [200, 12.6], [300, 14.9], [400, 16.6], [600, 19.8], [800, 22.6], [1000, 25.4], [1200, 28], [1500, 31.7]], cp: [[100, 272], [200, 402], [300, 477], [400, 515], [600, 557], [800, 582], [1000, 611], [1200, 640], [1500, 682]], aliases: ["stainless 304", "stainless steel"] },
    aisi_316: { name: "AISI 316 stainless steel", src: "Table A.1, p. 931", rho: 8238, k: [[300, 13.4], [400, 15.2], [600, 18.3], [800, 21.3], [1000, 24.2]], cp: [[300, 468], [400, 504], [600, 550], [800, 576], [1000, 602]], aliases: ["stainless 316"] },
    aisi_347: { name: "AISI 347 stainless steel", src: "Table A.1, p. 931", rho: 7978, k: [[300, 14.2], [400, 15.8], [600, 18.9], [800, 21.9], [1000, 24.7]], cp: [[300, 480], [400, 513], [600, 559], [800, 585], [1000, 606]], aliases: ["stainless 347"] },
    lead: { name: "Lead", src: "Table A.1, p. 931", rho: 11340, Tm: 601, k: [[100, 39.7], [200, 36.7], [300, 35.3], [400, 34], [600, 31.4]], cp: [[100, 118], [200, 125], [300, 129], [400, 132], [600, 142]], aliases: ["Pb"] },
    magnesium: { name: "Magnesium", src: "Table A.1, p. 931", rho: 1740, Tm: 923, k: [[100, 169], [200, 159], [300, 156], [400, 153], [600, 149], [800, 146]], cp: [[100, 649], [200, 934], [300, 1024], [400, 1074], [600, 1170], [800, 1267]], aliases: ["Mg"] },
    molybdenum: { name: "Molybdenum", src: "Table A.1, p. 931", rho: 10240, Tm: 2894, k: [[100, 179], [200, 143], [300, 138], [400, 134], [600, 126], [800, 118], [1000, 112], [1200, 105], [1500, 98], [2000, 90], [2500, 86]], cp: [[100, 141], [200, 224], [300, 251], [400, 261], [600, 275], [800, 285], [1000, 295], [1200, 308], [1500, 330], [2000, 380], [2500, 459]], aliases: ["Mo"] },
    nickel: { name: "Nickel, pure", src: "Table A.1, p. 931", rho: 8900, Tm: 1728, k: [[100, 164], [200, 107], [300, 90.7], [400, 80.2], [600, 65.6], [800, 67.6], [1000, 71.8], [1200, 76.2], [1500, 82.6]], cp: [[100, 232], [200, 383], [300, 444], [400, 485], [600, 592], [800, 530], [1000, 562], [1200, 594], [1500, 616]], aliases: ["Ni"] },
    nichrome: { name: "Nichrome (80% Ni, 20% Cr)", src: "Table A.1, p. 931", rho: 8400, Tm: 1672, k: [[300, 12], [400, 14], [600, 16], [800, 21]], cp: [[300, 420], [400, 480], [600, 525], [800, 545]] },
    inconel_x750: { name: "Inconel X-750 (73% Ni, 15% Cr, 6.7% Fe)", src: "Table A.1, p. 931", rho: 8510, Tm: 1665, k: [[100, 8.7], [200, 10.3], [300, 11.7], [400, 13.5], [600, 17], [800, 20.5], [1000, 24], [1200, 27.6], [1500, 33]], cp: [[200, 372], [300, 439], [400, 473], [600, 510], [800, 546], [1000, 626]], aliases: ["Inconel"] },
    niobium: { name: "Niobium", src: "Table A.1, p. 931", rho: 8570, Tm: 2741, k: [[100, 55.2], [200, 52.6], [300, 53.7], [400, 55.2], [600, 58.2], [800, 61.3], [1000, 64.4], [1200, 67.5], [1500, 72.1], [2000, 79.1]], cp: [[100, 188], [200, 249], [300, 265], [400, 274], [600, 283], [800, 292], [1000, 301], [1200, 310], [1500, 324], [2000, 347]], aliases: ["Nb"] },
    palladium: { name: "Palladium", src: "Table A.1, p. 931", rho: 12020, Tm: 1827, k: [[100, 76.5], [200, 71.6], [300, 71.8], [400, 73.6], [600, 79.7], [800, 86.9], [1000, 94.2], [1200, 102], [1500, 110]], cp: [[100, 168], [200, 227], [300, 244], [400, 251], [600, 261], [800, 271], [1000, 281], [1200, 291], [1500, 307]], aliases: ["Pd"] },
    platinum: { name: "Platinum, pure", src: "Table A.1, p. 931", rho: 21450, Tm: 2045, k: [[100, 77.5], [200, 72.6], [300, 71.6], [400, 71.8], [600, 73.2], [800, 75.6], [1000, 78.7], [1200, 82.6], [1500, 89.5], [2000, 99.4]], cp: [[100, 100], [200, 125], [300, 133], [400, 136], [600, 141], [800, 146], [1000, 152], [1200, 157], [1500, 165], [2000, 179]], aliases: ["Pt"] },
    platinum_rhodium: { name: "Platinum-rhodium alloy (60% Pt, 40% Rh)", src: "Table A.1, p. 931", rho: 16630, Tm: 1800, k: [[300, 47], [400, 52], [600, 59], [800, 65], [1000, 69], [1200, 73], [1500, 76]], cp: [[300, 162]], aliases: ["60Pt-40Rh"] },
    rhenium: { name: "Rhenium", src: "Table A.1, p. 931", rho: 21100, Tm: 3453, k: [[100, 58.9], [200, 51], [300, 47.9], [400, 46.1], [600, 44.2], [800, 44.1], [1000, 44.6], [1200, 45.7], [1500, 47.8], [2000, 51.9]], cp: [[100, 97], [200, 127], [300, 136], [400, 139], [600, 145], [800, 151], [1000, 156], [1200, 162], [1500, 171], [2000, 186]], aliases: ["Re"] },
    rhodium: { name: "Rhodium", src: "Table A.1, p. 931", rho: 12450, Tm: 2236, k: [[100, 186], [200, 154], [300, 150], [400, 146], [600, 136], [800, 127], [1000, 121], [1200, 116], [1500, 110], [2000, 112]], cp: [[100, 147], [200, 220], [300, 243], [400, 253], [600, 274], [800, 293], [1000, 311], [1200, 327], [1500, 349], [2000, 376]], aliases: ["Rh"] },
    silicon: { name: "Silicon", src: "Table A.1, p. 931", rho: 2330, Tm: 1685, k: [[100, 884], [200, 264], [300, 148], [400, 98.9], [600, 61.9], [800, 42.2], [1000, 31.2], [1200, 25.7], [1500, 22.7]], cp: [[100, 259], [200, 556], [300, 712], [400, 790], [600, 867], [800, 913], [1000, 946], [1200, 967], [1500, 992]], aliases: ["Si"] },
    silver: { name: "Silver", src: "Table A.1, p. 931", rho: 10500, Tm: 1235, k: [[100, 444], [200, 430], [300, 429], [400, 425], [600, 412], [800, 396], [1000, 379], [1200, 361]], cp: [[100, 187], [200, 225], [300, 235], [400, 239], [600, 250], [800, 262], [1000, 277], [1200, 292]], aliases: ["Ag"] },
    tantalum: { name: "Tantalum", src: "Table A.1, p. 931", rho: 16600, Tm: 3269, k: [[100, 59.2], [200, 57.5], [300, 57.5], [400, 57.8], [600, 58.6], [800, 59.4], [1000, 60.2], [1200, 61], [1500, 62.2], [2000, 64.1], [2500, 65.6]], cp: [[100, 110], [200, 133], [300, 140], [400, 144], [600, 146], [800, 149], [1000, 152], [1200, 155], [1500, 160], [2000, 172], [2500, 189]], aliases: ["Ta"] },
    thorium: { name: "Thorium", src: "Table A.1, p. 931", rho: 11700, Tm: 2023, k: [[100, 59.8], [200, 54.6], [300, 54], [400, 54.5], [600, 55.8], [800, 56.9], [1000, 56.9], [1200, 58.7]], cp: [[100, 99], [200, 112], [300, 118], [400, 124], [600, 134], [800, 145], [1000, 156], [1200, 167]], aliases: ["Th"] },
    tin: { name: "Tin", src: "Table A.1, p. 931", rho: 7310, Tm: 505, k: [[100, 85.2], [200, 73.3], [300, 66.6], [400, 62.2]], cp: [[100, 188], [200, 215], [300, 227], [400, 243]], aliases: ["Sn"] },
    titanium: { name: "Titanium", src: "Table A.1, p. 932", rho: 4500, Tm: 1953, k: [[100, 30.5], [200, 24.5], [300, 21.9], [400, 20.4], [600, 19.4], [800, 19.7], [1000, 20.7], [1200, 22], [1500, 24.5]], cp: [[100, 300], [200, 465], [300, 522], [400, 551], [600, 591], [800, 633], [1000, 675], [1200, 620], [1500, 686]], aliases: ["Ti"] },
    tungsten: { name: "Tungsten", src: "Table A.1, p. 932", rho: 19300, Tm: 3660, k: [[100, 208], [200, 186], [300, 174], [400, 159], [600, 137], [800, 125], [1000, 118], [1200, 113], [1500, 107], [2000, 100], [2500, 95]], cp: [[100, 87], [200, 122], [300, 132], [400, 137], [600, 142], [800, 145], [1000, 148], [1200, 152], [1500, 157], [2000, 167], [2500, 176]], aliases: ["W"] },
    uranium: { name: "Uranium", src: "Table A.1, p. 932", rho: 19070, Tm: 1406, k: [[100, 21.7], [200, 25.1], [300, 27.6], [400, 29.6], [600, 34], [800, 38.8], [1000, 43.9], [1200, 49]], cp: [[100, 94], [200, 108], [300, 116], [400, 125], [600, 146], [800, 176], [1000, 180], [1200, 161]], aliases: ["U"] },
    vanadium: { name: "Vanadium", src: "Table A.1, p. 932", rho: 6100, Tm: 2192, k: [[100, 35.8], [200, 31.3], [300, 30.7], [400, 31.3], [600, 33.3], [800, 35.7], [1000, 38.2], [1200, 40.8], [1500, 44.6], [2000, 50.9]], cp: [[100, 258], [200, 430], [300, 489], [400, 515], [600, 540], [800, 563], [1000, 597], [1200, 645], [1500, 714], [2000, 867]], aliases: ["V"] },
    zinc: { name: "Zinc", src: "Table A.1, p. 932", rho: 7140, Tm: 693, k: [[100, 117], [200, 118], [300, 116], [400, 111], [600, 103]], cp: [[100, 297], [200, 367], [300, 389], [400, 402], [600, 436]], aliases: ["Zn"] },
    zirconium: { name: "Zirconium", src: "Table A.1, p. 932", rho: 6570, Tm: 2125, k: [[100, 33.2], [200, 25.2], [300, 22.7], [400, 21.6], [600, 20.7], [800, 21.6], [1000, 23.7], [1200, 26], [1500, 28.8], [2000, 33]], cp: [[100, 205], [200, 264], [300, 278], [400, 300], [600, 322], [800, 342], [1000, 362], [1200, 344], [1500, 344], [2000, 344]], aliases: ["Zr"] },
    sapphire: { name: "Aluminum oxide, sapphire", src: "Table A.2, p. 933", rho: 3970, Tm: 2323, k: [[100, 450], [200, 82], [300, 46], [400, 32.4], [600, 18.9], [800, 13], [1000, 10.5]], cp: [[300, 765], [400, 940], [600, 1110], [800, 1180], [1000, 1225]], aliases: ["aluminum oxide sapphire"] },
    alumina: { name: "Aluminum oxide, polycrystalline", src: "Table A.2, p. 933", rho: 3970, Tm: 2323, k: [[100, 133], [200, 55], [300, 36], [400, 26.4], [600, 15.8], [800, 10.4], [1000, 7.85], [1200, 6.55], [1500, 5.66], [2000, 6]], cp: [[300, 765], [400, 940], [600, 1110], [800, 1180], [1000, 1225]], aliases: ["aluminum oxide", "Al2O3"] },
    beryllium_oxide: { name: "Beryllium oxide", src: "Table A.2, p. 933", rho: 3000, Tm: 2725, k: [[300, 272], [400, 196], [600, 111], [800, 70], [1000, 47], [1200, 33], [1500, 21.5], [2000, 15]], cp: [[300, 1030], [400, 1350], [600, 1690], [800, 1865], [1000, 1975], [1200, 2055], [1500, 2145], [2000, 2750]], aliases: ["BeO"] },
    carbon_amorphous: { name: "Carbon, amorphous", src: "Table A.2, p. 933", rho: 1950, Tm: 1500, k: [[100, 0.67], [200, 1.18], [300, 1.6], [400, 1.89], [600, 2.19], [800, 2.37], [1000, 2.53], [1200, 2.84], [1500, 3.48]], aliases: ["amorphous carbon"] },
    diamond: { name: "Diamond, type IIa, insulator", src: "Table A.2, p. 933", rho: 3500, k: [[100, 10000], [200, 4000], [300, 2300], [400, 1540]], cp: [[100, 21], [200, 194], [300, 509], [400, 853]] },
    pyroceram: { name: "Pyroceram, Corning 9606", src: "Table A.2, p. 933", rho: 2600, Tm: 1623, k: [[100, 5.25], [200, 4.78], [300, 3.98], [400, 3.64], [600, 3.28], [800, 3.08], [1000, 2.96], [1200, 2.87], [1500, 2.79]], cp: [[300, 808], [400, 908], [600, 1038], [800, 1122], [1000, 1197], [1200, 1264], [1500, 1498]] },
    silicon_carbide: { name: "Silicon carbide", src: "Table A.2, p. 934", rho: 3160, Tm: 3100, k: [[300, 490], [1000, 87], [1200, 58], [1500, 30]], cp: [[300, 675], [400, 880], [600, 1050], [800, 1135], [1000, 1195], [1200, 1243], [1500, 1310]], aliases: ["SiC"] },
    fused_silica: { name: "Silicon dioxide, polycrystalline (fused silica)", src: "Table A.2, p. 934", rho: 2220, Tm: 1883, k: [[100, 0.69], [200, 1.14], [300, 1.38], [400, 1.51], [600, 1.75], [800, 2.17], [1000, 2.87], [1200, 4]], cp: [[300, 745], [400, 905], [600, 1040], [800, 1105], [1000, 1155], [1200, 1195]], aliases: ["silicon dioxide polycrystalline", "SiO2 polycrystalline"] },
    silicon_nitride: { name: "Silicon nitride", src: "Table A.2, p. 934", rho: 2400, Tm: 2173, k: [[300, 16], [400, 13.9], [600, 11.3], [800, 9.88], [1000, 8.76], [1200, 8], [1500, 7.16], [2000, 6.2]], cp: [[200, 578], [300, 691], [400, 778], [600, 937], [800, 1063], [1000, 1155], [1200, 1226], [1500, 1306], [2000, 1377]], aliases: ["Si3N4"] },
    sulfur: { name: "Sulfur", src: "Table A.2, p. 934", rho: 2070, Tm: 392, k: [[100, 0.165], [200, 0.185], [300, 0.206]], cp: [[100, 403], [200, 606], [300, 708]], aliases: ["S", "sulphur"] },
    thorium_dioxide: { name: "Thorium dioxide", src: "Table A.2, p. 934", rho: 9110, Tm: 3573, k: [[300, 13], [400, 10.2], [600, 6.6], [800, 4.7], [1000, 3.68], [1200, 3.12], [1500, 2.73], [2000, 2.5]], cp: [[300, 235], [400, 255], [600, 274], [800, 285], [1000, 295], [1200, 303], [1500, 315], [2000, 330]], aliases: ["ThO2"] },
    titanium_dioxide: { name: "Titanium dioxide, polycrystalline", src: "Table A.2, p. 934", rho: 4157, Tm: 2133, k: [[300, 8.4], [400, 7.01], [600, 5.02], [800, 3.94], [1000, 3.46], [1200, 3.28]], cp: [[300, 710], [400, 805], [600, 880], [800, 910], [1000, 930], [1200, 945]], aliases: ["TiO2"] },
    boron_epoxy_parallel: { name: "Boron fiber epoxy composite (30% vol), k parallel to fibers", src: "Table A.2, p. 933", rho: 2080, Tm: 590, k: [[100, 2.1], [200, 2.23], [300, 2.29], [400, 2.28]], cp: [[100, 364], [200, 757], [300, 1122], [400, 1431]] },
    boron_epoxy_perpendicular: { name: "Boron fiber epoxy composite (30% vol), k perpendicular to fibers", src: "Table A.2, p. 933", rho: 2080, Tm: 590, k: [[100, 0.37], [200, 0.49], [300, 0.59], [400, 0.6]], cp: [[100, 364], [200, 757], [300, 1122], [400, 1431]] },
    graphite_pyrolytic_parallel: { name: "Graphite, pyrolytic, k parallel to layers", src: "Table A.2, p. 933", rho: 2210, Tm: 2273, k: [[100, 4970], [200, 3230], [300, 1950], [400, 1390], [600, 892], [800, 667], [1000, 534], [1200, 448], [1500, 357], [2000, 262]], cp: [[100, 136], [200, 411], [300, 709], [400, 992], [600, 1406], [800, 1650], [1000, 1793], [1200, 1890], [1500, 1974], [2000, 2043]] },
    graphite_pyrolytic_perpendicular: { name: "Graphite, pyrolytic, k perpendicular to layers", src: "Table A.2, p. 933", rho: 2210, Tm: 2273, k: [[100, 16.8], [200, 9.23], [300, 5.7], [400, 4.09], [600, 2.68], [800, 2.01], [1000, 1.6], [1200, 1.34], [1500, 1.08], [2000, 0.81]], cp: [[100, 136], [200, 411], [300, 709], [400, 992], [600, 1406], [800, 1650], [1000, 1793], [1200, 1890], [1500, 1974], [2000, 2043]] },
    graphite_epoxy_parallel: { name: "Graphite fiber epoxy composite (25% vol), k parallel to fibers (heat flow)", src: "Table A.2, p. 933", rho: 1400, Tm: 450, k: [[100, 5.7], [200, 8.7], [300, 11.1], [400, 13]], cp: [[100, 337], [200, 642], [300, 935], [400, 1216]] },
    graphite_epoxy_perpendicular: { name: "Graphite fiber epoxy composite (25% vol), k perpendicular to fibers (heat flow)", src: "Table A.2, p. 933", rho: 1400, Tm: 450, k: [[100, 0.46], [200, 0.68], [300, 0.87], [400, 1.1]], cp: [[100, 337], [200, 642], [300, 935], [400, 1216]] },
    quartz_parallel: { name: "Silicon dioxide, crystalline (quartz), k parallel to the c axis", src: "Table A.2, p. 934", rho: 2650, Tm: 1883, k: [[100, 39], [200, 16.4], [300, 10.4], [400, 7.6], [600, 5], [800, 4.2]], cp: [[300, 745], [400, 885], [600, 1075], [800, 1250]] },
    quartz_perpendicular: { name: "Silicon dioxide, crystalline (quartz), k perpendicular to the c axis", src: "Table A.2, p. 934", rho: 2650, Tm: 1883, k: [[100, 20.8], [200, 9.5], [300, 6.21], [400, 4.7], [600, 3.4], [800, 3.1]], cp: [[300, 745], [400, 885], [600, 1075], [800, 1250]] },
    asbestos_cement_board: { name: "Asbestos-cement board", src: "Table A.3, p. 935", rho: 1920, k: [[300, 0.58]] },
    gypsum_board: { name: "Gypsum or plaster board", src: "Table A.3, p. 935", rho: 800, k: [[300, 0.17]], aliases: ["plasterboard", "drywall"] },
    plywood: { name: "Plywood", src: "Table A.3, p. 935", rho: 545, k: [[300, 0.12]], cp: [[300, 1215]] },
    sheathing: { name: "Sheathing, regular density", src: "Table A.3, p. 935", rho: 290, k: [[300, 0.055]], cp: [[300, 1300]] },
    acoustic_tile: { name: "Acoustic tile", src: "Table A.3, p. 935", rho: 290, k: [[300, 0.058]], cp: [[300, 1340]] },
    hardboard_siding: { name: "Hardboard, siding", src: "Table A.3, p. 935", rho: 640, k: [[300, 0.094]], cp: [[300, 1170]] },
    hardboard_high_density: { name: "Hardboard, high density", src: "Table A.3, p. 935", rho: 1010, k: [[300, 0.15]], cp: [[300, 1380]] },
    particle_board_low_density: { name: "Particle board, low density", src: "Table A.3, p. 935", rho: 590, k: [[300, 0.078]], cp: [[300, 1300]] },
    particle_board_high_density: { name: "Particle board, high density", src: "Table A.3, p. 935", rho: 1000, k: [[300, 0.17]], cp: [[300, 1300]] },
    hardwood: { name: "Hardwoods (oak, maple)", src: "Table A.3, p. 935", rho: 720, k: [[300, 0.16]], cp: [[300, 1255]], aliases: ["oak", "maple", "hardwoods"] },
    softwood: { name: "Softwoods (fir, pine)", src: "Table A.3, p. 935", rho: 510, k: [[300, 0.12]], cp: [[300, 1380]], aliases: ["fir", "pine", "softwoods"] },
    cement_mortar: { name: "Cement mortar", src: "Table A.3, p. 935", rho: 1860, k: [[300, 0.72]], cp: [[300, 780]] },
    brick_common: { name: "Brick, common", src: "Table A.3, p. 935", rho: 1920, k: [[300, 0.72]], cp: [[300, 835]], aliases: ["brick"] },
    brick_face: { name: "Brick, face", src: "Table A.3, p. 935", rho: 2083, k: [[300, 1.3]] },
    clay_tile_1cell: { name: "Clay tile, hollow, 1 cell deep, 10 cm thick (effective k)", src: "Table A.3, p. 935", k: [[300, 0.52]] },
    clay_tile_3cells: { name: "Clay tile, hollow, 3 cells deep, 30 cm thick (effective k)", src: "Table A.3, p. 935", k: [[300, 0.69]] },
    concrete_block_oval_sand: { name: "Concrete block, 3 oval cores, sand/gravel, 20 cm thick (effective k)", src: "Table A.3, p. 935", k: [[300, 1]] },
    concrete_block_oval_cinder: { name: "Concrete block, 3 oval cores, cinder aggregate, 20 cm thick (effective k)", src: "Table A.3, p. 935", k: [[300, 0.67]] },
    concrete_block_rect: { name: "Concrete block, rectangular core, 2 cores, 20 cm thick, 16 kg (effective k)", src: "Table A.3, p. 935", k: [[300, 1.1]] },
    concrete_block_rect_filled: { name: "Concrete block, rectangular core, 2 cores, filled cores (effective k)", src: "Table A.3, p. 935", k: [[300, 0.6]] },
    cement_plaster: { name: "Cement plaster, sand aggregate", src: "Table A.3, p. 935", rho: 1860, k: [[300, 0.72]] },
    gypsum_plaster_sand: { name: "Gypsum plaster, sand aggregate", src: "Table A.3, p. 935", rho: 1680, k: [[300, 0.22]], cp: [[300, 1085]] },
    gypsum_plaster_vermiculite: { name: "Gypsum plaster, vermiculite aggregate", src: "Table A.3, p. 935", rho: 720, k: [[300, 0.25]] },
    glass_fiber_paper_faced_16: { name: "Glass fiber blanket, paper faced, 16 kg/m3", src: "Table A.3, p. 936", rho: 16, k: [[300, 0.046]] },
    glass_fiber_paper_faced_28: { name: "Glass fiber blanket, paper faced, 28 kg/m3", src: "Table A.3, p. 936", rho: 28, k: [[300, 0.038]] },
    glass_fiber_paper_faced_40: { name: "Glass fiber blanket, paper faced, 40 kg/m3", src: "Table A.3, p. 936", rho: 40, k: [[300, 0.035]] },
    glass_fiber_duct_liner: { name: "Glass fiber, coated; duct liner", src: "Table A.3, p. 936", rho: 32, k: [[300, 0.038]], cp: [[300, 835]] },
    glass_fiber_organic_bonded: { name: "Glass fiber board, organic bonded", src: "Table A.3, p. 936", rho: 105, k: [[300, 0.036]], cp: [[300, 795]] },
    mineral_fiberboard: { name: "Mineral fiberboard; roofing material", src: "Table A.3, p. 936", rho: 265, k: [[300, 0.049]] },
    wood_shredded_cemented: { name: "Wood, shredded/cemented", src: "Table A.3, p. 936", rho: 350, k: [[300, 0.087]], cp: [[300, 1590]] },
    cork: { name: "Cork board", src: "Table A.3, p. 936", rho: 120, k: [[300, 0.039]], cp: [[300, 1800]] },
    cork_granulated: { name: "Cork, granulated (loose fill)", src: "Table A.3, p. 936", rho: 160, k: [[300, 0.045]] },
    diatomaceous_silica_coarse: { name: "Diatomaceous silica, coarse (loose fill)", src: "Table A.3, p. 936", rho: 350, k: [[300, 0.069]] },
    diatomaceous_silica_powder: { name: "Diatomaceous silica, powder (loose fill)", src: "Table A.3, p. 936", rho: 400, k: [[300, 0.091]] },
    diatomaceous_silica_fine_200: { name: "Diatomaceous silica, fine powder, 200 kg/m3 (loose fill)", src: "Table A.3, p. 936", rho: 200, k: [[300, 0.052]] },
    diatomaceous_silica_fine_275: { name: "Diatomaceous silica, fine powder, 275 kg/m3 (loose fill)", src: "Table A.3, p. 936", rho: 275, k: [[300, 0.061]] },
    glass_fiber_blown: { name: "Glass fiber, poured or blown (loose fill)", src: "Table A.3, p. 936", rho: 16, k: [[300, 0.043]], cp: [[300, 835]] },
    vermiculite_flakes_80: { name: "Vermiculite, flakes, 80 kg/m3", src: "Table A.3, p. 936", rho: 80, k: [[300, 0.068]], cp: [[300, 835]] },
    vermiculite_flakes_160: { name: "Vermiculite, flakes, 160 kg/m3", src: "Table A.3, p. 936", rho: 160, k: [[300, 0.063]], cp: [[300, 1000]] },
    mineral_wool_sprayed: { name: "Mineral wool granules with asbestos/inorganic binders, sprayed", src: "Table A.3, p. 936", rho: 190, k: [[300, 0.046]] },
    cork_mastic: { name: "Polyvinyl acetate cork mastic; sprayed or troweled", src: "Table A.3, p. 936", k: [[300, 0.1]] },
    urethane_foam: { name: "Urethane, two-part mixture; rigid foam", src: "Table A.3, p. 936", rho: 70, k: [[300, 0.026]], cp: [[300, 1045]], aliases: ["polyurethane foam", "urethane"] },
    foil_glass_mats_evacuated: { name: "Aluminum foil separating fluffy glass mats; 10-12 layers, evacuated; cryogenic (k at 150 K)", src: "Table A.3, p. 936", rho: 40, k: [[150, 0.00016]] },
    foil_glass_paper_evacuated: { name: "Aluminum foil and glass paper laminate; 75-150 layers; evacuated; cryogenic (k at 150 K)", src: "Table A.3, p. 936", rho: 120, k: [[150, 1.7e-05]] },
    silica_powder_evacuated: { name: "Typical silica powder, evacuated", src: "Table A.3, p. 936", rho: 160, k: [[300, 0.0017]] },
    blanket_mineral_fiber_920: { name: "Blanket, mineral fiber, metal reinforced, max. 920 K", src: "Table A.3, p. 937", k: [[310, 0.038], [365, 0.046], [420, 0.056], [530, 0.078]], note: "density 96-192 kg/m3; maximum service temperature 920 K" },
    blanket_mineral_fiber_815: { name: "Blanket, mineral fiber, metal reinforced, max. 815 K", src: "Table A.3, p. 937", k: [[310, 0.035], [365, 0.045], [420, 0.058], [530, 0.088]], note: "density 40-96 kg/m3; maximum service temperature 815 K" },
    blanket_glass_fiber_10: { name: "Blanket, mineral fiber, glass; fine fiber, organic bonded, 10 kg/m3", src: "Table A.3, p. 937", rho: 10, k: [[240, 0.036], [255, 0.038], [270, 0.04], [285, 0.043], [300, 0.048], [310, 0.052], [365, 0.076]], note: "maximum service temperature 450 K" },
    blanket_glass_fiber_12: { name: "Blanket, mineral fiber, glass; fine fiber, organic bonded, 12 kg/m3", src: "Table A.3, p. 937", rho: 12, k: [[240, 0.035], [255, 0.036], [270, 0.039], [285, 0.042], [300, 0.046], [310, 0.049], [365, 0.069]] },
    blanket_glass_fiber_16: { name: "Blanket, mineral fiber, glass; fine fiber, organic bonded, 16 kg/m3", src: "Table A.3, p. 937", rho: 16, k: [[240, 0.033], [255, 0.035], [270, 0.036], [285, 0.039], [300, 0.042], [310, 0.046], [365, 0.062]] },
    blanket_glass_fiber_24: { name: "Blanket, mineral fiber, glass; fine fiber, organic bonded, 24 kg/m3", src: "Table A.3, p. 937", rho: 24, k: [[240, 0.03], [255, 0.032], [270, 0.033], [285, 0.036], [300, 0.039], [310, 0.04], [365, 0.053]] },
    blanket_glass_fiber_32: { name: "Blanket, mineral fiber, glass; fine fiber, organic bonded, 32 kg/m3", src: "Table A.3, p. 937", rho: 32, k: [[240, 0.029], [255, 0.03], [270, 0.032], [285, 0.033], [300, 0.036], [310, 0.038], [365, 0.048]] },
    blanket_glass_fiber_48: { name: "Blanket, mineral fiber, glass; fine fiber, organic bonded, 48 kg/m3", src: "Table A.3, p. 937", rho: 48, k: [[240, 0.027], [255, 0.029], [270, 0.03], [285, 0.032], [300, 0.033], [310, 0.035], [365, 0.045]] },
    blanket_alumina_silica_48: { name: "Blanket, alumina-silica fiber, 48 kg/m3", src: "Table A.3, p. 937", rho: 48, k: [[530, 0.071], [645, 0.105], [750, 0.15]], note: "maximum service temperature 1530 K" },
    blanket_alumina_silica_64: { name: "Blanket, alumina-silica fiber, 64 kg/m3", src: "Table A.3, p. 937", rho: 64, k: [[530, 0.059], [645, 0.087], [750, 0.125]] },
    blanket_alumina_silica_96: { name: "Blanket, alumina-silica fiber, 96 kg/m3", src: "Table A.3, p. 937", rho: 96, k: [[530, 0.052], [645, 0.076], [750, 0.1]] },
    blanket_alumina_silica_128: { name: "Blanket, alumina-silica fiber, 128 kg/m3", src: "Table A.3, p. 937", rho: 128, k: [[530, 0.049], [645, 0.068], [750, 0.091]] },
    felt_semirigid_480: { name: "Felt, semirigid; organic bonded, max. 480 K", src: "Table A.3, p. 937", k: [[270, 0.035], [285, 0.036], [300, 0.038], [310, 0.039], [365, 0.051], [420, 0.063]], note: "density 50-125 kg/m3; maximum service temperature 480 K" },
    felt_semirigid_730: { name: "Felt, semirigid; organic bonded, max. 730 K, 50 kg/m3", src: "Table A.3, p. 937", rho: 50, k: [[200, 0.023], [215, 0.025], [230, 0.026], [240, 0.027], [255, 0.029], [270, 0.03], [285, 0.032], [300, 0.033], [310, 0.035], [365, 0.051], [420, 0.079]], note: "maximum service temperature 730 K" },
    felt_laminated: { name: "Felt, laminated; no binder", src: "Table A.3, p. 937", rho: 120, k: [[420, 0.051], [530, 0.065], [645, 0.087]], note: "maximum service temperature 920 K" },
    asbestos_paper_4ply: { name: "Asbestos paper, laminated and corrugated, 4-ply", src: "Table A.3, p. 937", rho: 190, k: [[300, 0.078], [310, 0.082], [365, 0.098]], note: "maximum service temperature 420 K" },
    asbestos_paper_6ply: { name: "Asbestos paper, laminated and corrugated, 6-ply", src: "Table A.3, p. 937", rho: 255, k: [[300, 0.071], [310, 0.074], [365, 0.085]], note: "maximum service temperature 420 K" },
    asbestos_paper_8ply: { name: "Asbestos paper, laminated and corrugated, 8-ply", src: "Table A.3, p. 937", rho: 300, k: [[300, 0.068], [310, 0.071], [365, 0.082]], note: "maximum service temperature 420 K" },
    magnesia_85: { name: "Magnesia, 85%", src: "Table A.3, p. 937", rho: 185, k: [[310, 0.051], [365, 0.055], [420, 0.061]], note: "maximum service temperature 590 K" },
    calcium_silicate: { name: "Calcium silicate", src: "Table A.3, p. 937", rho: 190, k: [[310, 0.055], [365, 0.059], [420, 0.063], [530, 0.075], [645, 0.089], [750, 0.104]], note: "maximum service temperature 920 K", aliases: ["calsil"] },
    cellular_glass: { name: "Cellular glass", src: "Table A.3, p. 938", rho: 145, k: [[230, 0.046], [240, 0.048], [255, 0.051], [270, 0.052], [285, 0.055], [300, 0.058], [310, 0.062], [365, 0.069], [420, 0.079]], cp: [[300, 1000]], note: "maximum service temperature 700 K" },
    diatomaceous_silica_345: { name: "Diatomaceous silica block, 345 kg/m3, max. 1145 K", src: "Table A.3, p. 938", rho: 345, k: [[530, 0.092], [645, 0.098], [750, 0.104]], note: "maximum service temperature 1145 K" },
    diatomaceous_silica_385: { name: "Diatomaceous silica block, 385 kg/m3, max. 1310 K", src: "Table A.3, p. 938", rho: 385, k: [[530, 0.101], [645, 0.1], [750, 0.115]], note: "maximum service temperature 1310 K" },
    polystyrene_extruded: { name: "Polystyrene, rigid, extruded (R-12)", src: "Table A.3, p. 938", rho: 55, k: [[200, 0.023], [215, 0.023], [230, 0.022], [240, 0.023], [255, 0.023], [270, 0.025], [285, 0.026], [300, 0.027], [310, 0.029]], cp: [[300, 1210]], note: "maximum service temperature 350 K; k(T) for 56 kg/m3 (insulation table), density 55 kg/m3 and cp from the 300 K table", aliases: ["XPS", "extruded polystyrene"] },
    polystyrene_extruded_35: { name: "Polystyrene, rigid, extruded (R-12), 35 kg/m3", src: "Table A.3, p. 938", rho: 35, k: [[200, 0.023], [215, 0.023], [230, 0.023], [240, 0.025], [255, 0.025], [270, 0.026], [285, 0.027], [300, 0.029]], note: "maximum service temperature 350 K" },
    polystyrene_molded_beads: { name: "Polystyrene, rigid, molded beads", src: "Table A.3, p. 938", rho: 16, k: [[200, 0.026], [215, 0.029], [230, 0.03], [240, 0.033], [255, 0.035], [270, 0.036], [285, 0.038], [300, 0.04]], cp: [[300, 1210]], note: "maximum service temperature 350 K", aliases: ["EPS", "expanded polystyrene", "styrofoam"] },
    rubber_foamed: { name: "Rubber, rigid foamed", src: "Table A.3, p. 938", rho: 70, k: [[270, 0.029], [285, 0.03], [300, 0.032], [310, 0.033]], note: "maximum service temperature 340 K" },
    insulating_cement_clay: { name: "Insulating cement, mineral fiber, with clay binder", src: "Table A.3, p. 938", rho: 430, k: [[310, 0.071], [365, 0.079], [420, 0.088], [530, 0.105], [645, 0.123]], note: "maximum service temperature 1255 K" },
    insulating_cement_hydraulic: { name: "Insulating cement, mineral fiber, with hydraulic setting binder", src: "Table A.3, p. 938", rho: 560, k: [[310, 0.108], [365, 0.115], [420, 0.123], [530, 0.137]], note: "maximum service temperature 922 K" },
    cellulose_fill: { name: "Cellulose, wood or paper pulp (loose fill)", src: "Table A.3, p. 938", rho: 45, k: [[285, 0.038], [300, 0.039], [310, 0.042]] },
    perlite: { name: "Perlite, expanded (loose fill)", src: "Table A.3, p. 938", rho: 105, k: [[200, 0.036], [215, 0.039], [230, 0.042], [240, 0.043], [255, 0.046], [270, 0.049], [285, 0.051], [300, 0.053], [310, 0.056]] },
    vermiculite_expanded_122: { name: "Vermiculite, expanded (loose fill), 122 kg/m3", src: "Table A.3, p. 938", rho: 122, k: [[230, 0.056], [240, 0.058], [255, 0.061], [270, 0.063], [285, 0.065], [300, 0.068], [310, 0.071]] },
    vermiculite_expanded_80: { name: "Vermiculite, expanded (loose fill), 80 kg/m3", src: "Table A.3, p. 938", rho: 80, k: [[230, 0.049], [240, 0.051], [255, 0.055], [270, 0.058], [285, 0.061], [300, 0.063], [310, 0.066]] },
    asphalt: { name: "Asphalt", src: "Table A.3, p. 939", rho: 2115, k: [[300, 0.062]], cp: [[300, 920]] },
    bakelite: { name: "Bakelite", src: "Table A.3, p. 939", rho: 1300, k: [[300, 1.4]], cp: [[300, 1465]] },
    brick_carborundum: { name: "Brick, refractory: carborundum", src: "Table A.3, p. 939", k: [[872, 18.5], [1672, 11]], aliases: ["carborundum"] },
    brick_chrome: { name: "Brick, refractory: chrome brick", src: "Table A.3, p. 939", rho: 3010, k: [[473, 2.3], [823, 2.5], [1173, 2]], cp: [[473, 835]], note: "density and cp given at 473 K", aliases: ["chrome brick"] },
    brick_diatomaceous_silica: { name: "Brick, refractory: diatomaceous silica, fired", src: "Table A.3, p. 939", k: [[478, 0.25], [1145, 0.3]] },
    brick_fire_clay_1600: { name: "Brick, refractory: fire clay, burnt 1600 K", src: "Table A.3, p. 939", rho: 2050, k: [[773, 1], [1073, 1.1], [1373, 1.1]], cp: [[773, 960]], note: "density and cp given at 773 K" },
    brick_fire_clay_1725: { name: "Brick, refractory: fire clay, burnt 1725 K", src: "Table A.3, p. 939", rho: 2325, k: [[773, 1.3], [1073, 1.4], [1373, 1.4]], cp: [[773, 960]], note: "density and cp given at 773 K" },
    brick_fire_clay: { name: "Brick, refractory: fire clay brick", src: "Table A.3, p. 939", rho: 2645, k: [[478, 1], [922, 1.5], [1478, 1.8]], cp: [[478, 960]], note: "density and cp given at 478 K", aliases: ["fire clay brick", "firebrick"] },
    brick_magnesite: { name: "Brick, refractory: magnesite", src: "Table A.3, p. 939", k: [[478, 3.8], [922, 2.8], [1478, 1.9]], cp: [[478, 1130]], note: "cp given at 478 K", aliases: ["magnesite"] },
    clay: { name: "Clay", src: "Table A.3, p. 939", rho: 1460, k: [[300, 1.3]], cp: [[300, 880]] },
    coal_anthracite: { name: "Coal, anthracite", src: "Table A.3, p. 939", rho: 1350, k: [[300, 0.26]], cp: [[300, 1260]], aliases: ["coal", "anthracite"] },
    concrete: { name: "Concrete (stone mix)", src: "Table A.3, p. 939", rho: 2300, k: [[300, 1.4]], cp: [[300, 880]], aliases: ["concrete stone mix"] },
    cotton: { name: "Cotton", src: "Table A.3, p. 939", rho: 80, k: [[300, 0.06]], cp: [[300, 1300]] },
    banana: { name: "Banana (75.7% water content)", src: "Table A.3, p. 939", rho: 980, k: [[300, 0.481]], cp: [[300, 3350]] },
    apple: { name: "Apple, red (75% water content)", src: "Table A.3, p. 939", rho: 840, k: [[300, 0.513]], cp: [[300, 3600]] },
    cake_batter: { name: "Cake, batter", src: "Table A.3, p. 939", rho: 720, k: [[300, 0.223]] },
    cake_baked: { name: "Cake, fully baked", src: "Table A.3, p. 939", rho: 280, k: [[300, 0.121]] },
    chicken: { name: "Chicken meat, white (74.4% water content)", src: "Table A.3, p. 939", k: [[198, 1.6], [233, 1.49], [253, 1.35], [263, 1.2], [273, 0.476], [283, 0.48], [293, 0.489]], note: "k changes abruptly between 263 and 273 K (freezing): values between them are interpolated across the change", aliases: ["chicken meat"] },
    glass_plate: { name: "Glass, plate (soda lime)", src: "Table A.3, p. 939", rho: 2500, k: [[300, 1.4]], cp: [[300, 750]], aliases: ["glass", "soda lime glass", "window glass", "plate glass"] },
    pyrex: { name: "Glass, Pyrex", src: "Table A.3, p. 939", rho: 2225, k: [[300, 1.4]], cp: [[300, 835]] },
    ice_incropera: { name: "Ice (Incropera Table A.3; 'ice' and 'water' give the IAPWS formulation)", src: "Table A.3, p. 940", rho: 920, k: [[253, 2.03], [273, 1.88]], cp: [[253, 1945], [273, 2040]], note: "density given at 273 K" },
    leather: { name: "Leather (sole)", src: "Table A.3, p. 940", rho: 998, k: [[300, 0.159]] },
    paper: { name: "Paper", src: "Table A.3, p. 940", rho: 930, k: [[300, 0.18]], cp: [[300, 1340]] },
    paraffin: { name: "Paraffin", src: "Table A.3, p. 940", rho: 900, k: [[300, 0.24]], cp: [[300, 2890]] },
    granite: { name: "Rock: granite, Barre", src: "Table A.3, p. 940", rho: 2630, k: [[300, 2.79]], cp: [[300, 775]], aliases: ["granite barre"] },
    limestone: { name: "Rock: limestone, Salem", src: "Table A.3, p. 940", rho: 2320, k: [[300, 2.15]], cp: [[300, 810]] },
    marble: { name: "Rock: marble, Halston", src: "Table A.3, p. 940", rho: 2680, k: [[300, 2.8]], cp: [[300, 830]] },
    quartzite: { name: "Rock: quartzite, Sioux", src: "Table A.3, p. 940", rho: 2640, k: [[300, 5.38]], cp: [[300, 1105]] },
    sandstone: { name: "Rock: sandstone, Berea", src: "Table A.3, p. 940", rho: 2150, k: [[300, 2.9]], cp: [[300, 745]] },
    rubber_soft: { name: "Rubber, vulcanized, soft", src: "Table A.3, p. 940", rho: 1100, k: [[300, 0.13]], cp: [[300, 2010]], aliases: ["rubber"] },
    rubber_hard: { name: "Rubber, vulcanized, hard", src: "Table A.3, p. 940", rho: 1190, k: [[300, 0.16]] },
    sand: { name: "Sand", src: "Table A.3, p. 940", rho: 1515, k: [[300, 0.27]], cp: [[300, 800]] },
    soil: { name: "Soil", src: "Table A.3, p. 940", rho: 2050, k: [[300, 0.52]], cp: [[300, 1840]] },
    snow_110: { name: "Snow, 110 kg/m3", src: "Table A.3, p. 940", rho: 110, k: [[273, 0.049]], aliases: ["snow"] },
    snow_500: { name: "Snow, 500 kg/m3", src: "Table A.3, p. 940", rho: 500, k: [[273, 0.19]] },
    teflon: { name: "Teflon", src: "Table A.3, p. 940", rho: 2200, k: [[300, 0.35], [400, 0.45]], aliases: ["PTFE"] },
    skin: { name: "Tissue, human: skin", src: "Table A.3, p. 940", k: [[300, 0.37]] },
    fat: { name: "Tissue, human: fat layer (adipose)", src: "Table A.3, p. 940", k: [[300, 0.2]], aliases: ["adipose"] },
    muscle: { name: "Tissue, human: muscle", src: "Table A.3, p. 940", k: [[300, 0.5]] },
    balsa: { name: "Wood, cross grain: balsa", src: "Table A.3, p. 940", rho: 140, k: [[300, 0.055]] },
    cypress: { name: "Wood, cross grain: cypress", src: "Table A.3, p. 940", rho: 465, k: [[300, 0.097]] },
    fir_cross: { name: "Wood, cross grain: fir", src: "Table A.3, p. 940", rho: 415, k: [[300, 0.11]], cp: [[300, 2720]] },
    oak_cross: { name: "Wood, cross grain: oak", src: "Table A.3, p. 940", rho: 545, k: [[300, 0.17]], cp: [[300, 2385]] },
    yellow_pine: { name: "Wood, cross grain: yellow pine", src: "Table A.3, p. 940", rho: 640, k: [[300, 0.15]], cp: [[300, 2805]] },
    white_pine: { name: "Wood, cross grain: white pine", src: "Table A.3, p. 940", rho: 435, k: [[300, 0.11]] },
    oak_radial: { name: "Wood, radial: oak", src: "Table A.3, p. 940", rho: 545, k: [[300, 0.19]], cp: [[300, 2385]] },
    fir_radial: { name: "Wood, radial: fir", src: "Table A.3, p. 940", rho: 420, k: [[300, 0.14]], cp: [[300, 2720]] },
};

// Front end: conductivity('copper', T), specificheat(...), density(...), thermaldiffusivity(...) and meltingpoint('copper')
// are routed here by ThermoEngine when the first argument names a solid. Names ignore case, spaces and punctuation.
const Solids = {
    norm: (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''),
    index: null,
    get(name) {
        if (!Solids.index) {
            Solids.index = new Map();
            for (const [key, m] of Object.entries(SOLIDS_DB)) [key, ...(m.aliases || [])].forEach(n => Solids.index.set(Solids.norm(n), key));
        }
        return Solids.index.get(Solids.norm(name)) || null;
    },
    PROPS: ['density', 'specificheat', 'conductivity', 'thermaldiffusivity', 'meltingpoint'],
    // A tabulated property at temperature T (linear interpolation; outside the table: an error at the solution)
    at(key, prop, T, fname) {
        const m = SOLIDS_DB[key], tab = m[prop], label = `${fname}('${key}')`, what = prop === 'k' ? 'conductivity' : 'specific heat';
        if (typeof T !== 'number' || !Number.isFinite(T)) throw new Error(`${label}: the temperature must be a number (in K)`);
        if (!tab) throw new Error(`${label}: the ${what} of ${m.name} is not tabulated (${m.src})`);
        Interp.used = true;
        if (tab.length === 1) {
            const [T0, v] = tab[0];
            if (Math.abs(T - T0) <= 1e-9 * T0 || Interp.lenient) return v;
            const msg = `${label}: T = ${+T.toPrecision(7)} is outside the table, which gives the ${what} at ${T0} K only; write ${fname}('${key}', ${T0}) to use that value`;
            Interp.lastOutside = msg;
            throw new Error(msg);
        }
        return Interp.one(tab.map(r => r[0]), tab.map(r => r[1]), T, 'linear', false, 'T', label, ` K (${m.src})`);
    },
    call(fname, args) {
        const key = Solids.get(args[0]), m = SOLIDS_DB[key], rest = args.slice(1);
        if (!Solids.PROPS.includes(fname)) {
            throw new Error(`${fname}(): '${args[0]}' is a solid; solids have density, specificheat, conductivity, thermaldiffusivity and meltingpoint`);
        }
        if (fname === 'meltingpoint') {
            if (rest.length) throw new Error(`meltingpoint('${key}'): takes only the material name`);
            if (m.Tm === undefined) throw new Error(`meltingpoint('${key}'): no melting point is tabulated for ${m.name} (${m.src})`);
            return m.Tm;
        }
        if (rest.length !== 1) throw new Error(`${fname}('${key}', T): a solid takes one temperature (in K), got ${rest.length} more argument(s)`);
        const T = rest[0];
        if (fname === 'conductivity') return Solids.at(key, 'k', T, fname);
        if (fname === 'specificheat') return Solids.at(key, 'cp', T, fname);
        const rho = () => {
            if (m.rho === undefined) throw new Error(`${fname}('${key}'): the density of ${m.name} is not tabulated${m.note && /density/.test(m.note) ? ' (' + m.note + ')' : ''} (${m.src})`);
            return m.rho;
        };
        if (fname === 'density') {   // tabulated at one temperature (300 K unless noted): used at every temperature, as in the textbook
            if (typeof T !== 'number' || !Number.isFinite(T)) throw new Error(`density('${key}'): the temperature must be a number (in K)`);
            return rho();
        }
        return Solids.at(key, 'k', T, fname) / (rho() * Solids.at(key, 'cp', T, fname));   // thermaldiffusivity
    },
};
