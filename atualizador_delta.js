const fs = require('fs');
const path = require('path');

// 📁 ONDE ESTÃO OS ARQUIVOS QUE VAMOS LER E GRAVAR
const pastaDestino = path.join(__dirname, 'json', 'simulacao_pve10');
if (!fs.existsSync(pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true });
}

const arquivoFila = path.join(__dirname, 'atualizar.txt');
const arquivoRelatorio = path.join(__dirname, 'relatorio_delta.txt');
const arquivoHistorico = path.join(__dirname, 'historico_delta.json');

const URLS = {
    MAIN_DATA: "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/poke_data.json",
    MEGA_DATA: "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/mega_reides.json",
    GIGAMAX_DATA: "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/poke_data_gigamax.json",
    TYPE_EFFECTIVENESS: "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/eficacia_tipos_poke.json",
    MOVES_GYM_FAST: "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/movimentos_rapidos_gym.json",
    MOVES_GYM_CHARGED: "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/movimentos_carregados_gym.json",
    MOVE_DATA: "https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/moves.json" 
};

let GLOBAL_POKE_DB = {};
let ATACANTES_VIP = [];

const raidConfigs = {
    "1": { hp: 600, tempo: 180 }, "2": { hp: 1800, tempo: 180 }, "3": { hp: 3600, tempo: 180 },
    "4": { hp: 9000, tempo: 180 }, "5": { hp: 15000, tempo: 300 }, "mega": { hp: 9000, tempo: 300 },
    "mega_lendaria": { hp: 22500, tempo: 300 }, "primal": { hp: 22500, tempo: 300 },
    "elite": { hp: 20000, tempo: 300 },
    "dmax_1": { hp: 1700, tempo: 180 }, "dmax_3": { hp: 10000, tempo: 180 }, "dmax_5": { hp: 15000, tempo: 300 },
    "gmax_6": { hp: 90000, tempo: 300 }
};

const ORDEM_DAS_TIERS = ["1", "2", "3", "4", "5", "mega", "mega_lendaria", "primal", "elite", "dmax_1", "dmax_3", "dmax_5", "gmax_6"];

// ====================================================================
// 📝 SISTEMA DE LOGS E UI
// ====================================================================
function registrarLog(mensagem) {
    console.log(mensagem); 
    fs.appendFileSync(arquivoRelatorio, mensagem + "\n", 'utf8'); 
}

function iniciarRelatorio() {
    const cabecalho = `========================================================\n` +
                      `⚡ RELATÓRIO DO MOTOR DELTA (V10 PURO NO BOSS) ⚡\n` +
                      `Data: ${new Date().toLocaleString('pt-BR')}\n` +
                      `========================================================\n\n`;
    fs.writeFileSync(arquivoRelatorio, cabecalho, 'utf8');
}

function desenharBarra(atual, total, icone, nomeFase) {
    const tamanhoBarra = 25; 
    const progresso = atual / total;
    const blocosPreenchidos = Math.round(tamanhoBarra * progresso);
    const barra = '█'.repeat(blocosPreenchidos) + '░'.repeat(tamanhoBarra - blocosPreenchidos);
    const pct = Math.floor(progresso * 100).toString().padStart(3, ' ');
    process.stdout.write(` ${icone} [${nomeFase.padEnd(16)}] [${barra}] ${pct}% | 🥊 ${atual}/${total}\r`);
}

function carregarHistorico() {
    if (fs.existsSync(arquivoHistorico)) return JSON.parse(fs.readFileSync(arquivoHistorico, 'utf8'));
    return {}; 
}

function salvarHistorico(historico) {
    fs.writeFileSync(arquivoHistorico, JSON.stringify(historico, null, 4), 'utf8');
}

function atualizarDiarioDeBordo() {
    const txtLog = path.join(__dirname, 'o_que_eu_ja_fiz.txt');
    if (!fs.existsSync(pastaDestino)) return;
    
    const arquivos = fs.readdirSync(pastaDestino).filter(f => f.endsWith('.json'));
    const mapa = {};

    arquivos.forEach(arq => {
        const match = arq.match(/^counters_(.+)_t(.+)\.json$/);
        if (match) {
            const nome = match[1]; 
            const tier = match[2];
            if (!mapa[nome]) mapa[nome] = [];
            if (!mapa[nome].includes(`t${tier}`)) mapa[nome].push(`t${tier}`);
        }
    });

    const nomesOrdenados = Object.keys(mapa).sort((a, b) => {
        const pokeA = GLOBAL_POKE_DB.todosOsPokemons.find(p => p.speciesName.toLowerCase().replace(/ /g, "_") === a);
        const pokeB = GLOBAL_POKE_DB.todosOsPokemons.find(p => p.speciesName.toLowerCase().replace(/ /g, "_") === b);
        const dexA = pokeA ? pokeA.dex : 9999;
        const dexB = pokeB ? pokeB.dex : 9999;
        return dexA - dexB;
    });

    let conteudo = "";
    nomesOrdenados.forEach(nome => {
         const tiersArray = mapa[nome].sort((a, b) => {
             let indexA = ORDEM_DAS_TIERS.indexOf(a.replace("t", ""));
             let indexB = ORDEM_DAS_TIERS.indexOf(b.replace("t", ""));
             return (indexA === -1 ? 99 : indexA) - (indexB === -1 ? 99 : indexB);
         });
         
         const nomeFormatado = nome.replace(/_/g, " ");
         conteudo += `${nomeFormatado}\n${tiersArray.join(" ")}\n\n`;
    });

    fs.writeFileSync(txtLog, conteudo);
}

// ====================================================================
// 🧠 MATEMÁTICA E LÓGICA DO COMBATE (IDÊNTICO AO V10)
// ====================================================================
function getTypeEffectiveness(moveType, defenderTypes, typeData) {
    if (!moveType || !defenderTypes || !typeData) return 1.0;
    try {
        const formatarTipo = (t) => {
            if (!t) return "";
            const tNorm = String(t).toUpperCase().replace("POKEMON_TYPE_", "").trim();
            const dict = { NORMAL: "Normal", FIRE: "Fogo", WATER: "Água", ELECTRIC: "Elétrico", GRASS: "Planta", ICE: "Gelo", FIGHTING: "Lutador", POISON: "Venenoso", GROUND: "Terrestre", FLYING: "Voador", PSYCHIC: "Psíquico", BUG: "Inseto", ROCK: "Pedra", GHOST: "Fantasma", DRAGON: "Dragão", STEEL: "Aço", DARK: "Sombrio", FAIRY: "Fada" };
            return dict[tNorm] || tNorm.charAt(0).toUpperCase() + tNorm.slice(1).toLowerCase();
        };
        const ataquePT = formatarTipo(moveType);
        const defensorPT = defenderTypes.filter(t => t && String(t).toLowerCase() !== "none").map(t => formatarTipo(t)).sort();
        const dadosMatch = typeData.find(entry => {
            let jsonTipos = [];
            if (entry.tipos) jsonTipos = Array.isArray(entry.tipos) ? entry.tipos : [entry.tipos];
            else if (entry.tipo) jsonTipos = Array.isArray(entry.tipo) ? entry.tipo : [entry.tipo];
            jsonTipos = jsonTipos.map(t => formatarTipo(t)).sort();
            return JSON.stringify(defensorPT) === JSON.stringify(jsonTipos);
        });
        if (!dadosMatch || !dadosMatch.defesa) return 1.0;
        const check = (categoria) => {
            if (!categoria) return null;
            for (const multKey in categoria) { if (categoria[multKey].includes(ataquePT)) return parseFloat(multKey.replace("x", "")); }
            return null;
        };
        const fFraq = check(dadosMatch.defesa.fraqueza); if (fFraq !== null) return fFraq;
        const fRes = check(dadosMatch.defesa.resistencia); if (fRes !== null) return fRes;
        if (dadosMatch.defesa.imunidade && dadosMatch.defesa.imunidade.includes(ataquePT)) return 0.390625;
        return 1.0;
    } catch (e) { return 1.0; }
}

const getMoveData = (id, isFast) => {
    let move = (isFast ? GLOBAL_POKE_DB.gymFastMap : GLOBAL_POKE_DB.gymChargedMap).get(id);
    if (!move && !id.endsWith("_FAST")) move = GLOBAL_POKE_DB.gymFastMap.get(id + "_FAST");
    if (!move && id.endsWith("_FAST")) move = GLOBAL_POKE_DB.gymFastMap.get(id.replace("_FAST", ""));
    if (!move || (!move.durationMs && !move.duration)) {
        const fallback = GLOBAL_POKE_DB.moveDataObjMap.get(id) || GLOBAL_POKE_DB.moveDataObjMap.get(id + "_FAST") || GLOBAL_POKE_DB.moveDataObjMap.get(id.replace("_FAST", ""));
        if (fallback) move = fallback;
    }
    return move;
};

function instanciarCombate(atacante, oponente, fId, cId, tempoMaximoRaid) {
    const CPM = 0.7903; 
    const atkUser = ((atacante.baseStats.atk || 10) + 15) * CPM; const defUser = ((atacante.baseStats.def || 10) + 15) * CPM; const attackerHPMax = Math.floor(((atacante.baseStats.hp || 10) + 15) * CPM);
    const isShadow = atacante.speciesName.toLowerCase().includes("shadow"); const atkFinalUser = atkUser * (isShadow ? 1.2 : 1.0); const damageBonusMult = atacante.speciesName.toLowerCase().startsWith("mega ") ? 1.1 : 1.0;
    const atkBossReal = (oponente.baseStats.atk + 15) * CPM; const defInimigoReal = Math.max(1, (oponente.baseStats.def + 15) * CPM); const defUserFinal = isShadow ? defUser * 0.833 : defUser;
    
    const razaoDanoAtacante = atkFinalUser / defInimigoReal; const razaoDanoBoss = atkBossReal / defUserFinal;

    const fastMove = getMoveData(fId, true); const chargedMove = getMoveData(cId, false);
    const bFast = getMoveData(oponente.fastMoves[0], true); const bCharged = getMoveData(oponente.chargedMoves[0], false);
    if (!fastMove || !chargedMove || !bFast || !bCharged) return null;

    let mFast = atacante.types.some(t => t && String(t).toLowerCase() === String(fastMove.type).toLowerCase()) ? 1.2 : 1.0; mFast *= getTypeEffectiveness(fastMove.type, oponente.tipos, GLOBAL_POKE_DB.dadosEficacia);
    let mCharged = atacante.types.some(t => t && String(t).toLowerCase() === String(chargedMove.type).toLowerCase()) ? 1.2 : 1.0; mCharged *= getTypeEffectiveness(chargedMove.type, oponente.tipos, GLOBAL_POKE_DB.dadosEficacia);
    let mBossFast = oponente.tipos.some(t => t && String(t).toLowerCase() === String(bFast.type).toLowerCase()) ? 1.2 : 1.0; mBossFast *= getTypeEffectiveness(bFast.type, atacante.types, GLOBAL_POKE_DB.dadosEficacia);
    let mBossCharged = oponente.tipos.some(t => t && String(t).toLowerCase() === String(bCharged.type).toLowerCase()) ? 1.2 : 1.0; mBossCharged *= getTypeEffectiveness(bCharged.type, atacante.types, GLOBAL_POKE_DB.dadosEficacia);

    const dmgFast = Math.floor(0.5 * (fastMove.power || 0) * razaoDanoAtacante * mFast * damageBonusMult) + 1; const dmgCharged = Math.floor(0.5 * (chargedMove.power || 0) * razaoDanoAtacante * mCharged * damageBonusMult) + 1;
    const dmgBossFast = Math.floor(0.5 * (bFast.power || 0) * razaoDanoBoss * mBossFast) + 1; const dmgBossCharged = Math.floor(0.5 * (bCharged.power || 0) * razaoDanoBoss * mBossCharged) + 1;

    let tFast = parseFloat(fastMove.duration) || (fastMove.cooldown ? fastMove.cooldown / 1000 : 0.5); if(tFast > 10) tFast/=1000; if(tFast < 0.1) tFast = 0.5; tFast += 0.05;
    let tCharged = parseFloat(chargedMove.duration) || (chargedMove.cooldown ? chargedMove.cooldown / 1000 : 2.0); if(tCharged > 10) tCharged/=1000; if(tCharged < 0.1) tCharged = 2.0; tCharged += 0.5;
    
    const enGain = Math.max(1, fastMove.energyGain || fastMove.energy || 6); const enCost = Math.abs(chargedMove.energyCost || chargedMove.energy || 50);
    const bossEnCost = Math.abs(bCharged.energyCost || bCharged.energy || 50); const bossEnGain = bFast.energyGain || bFast.energy || 10;

    return function simularCenario(determMode = 1, isRNG = false) {
        let delayFast = isRNG ? (1.5 + (Math.random() + Math.random()) / 2) : (determMode === 0 ? 1.5 : (determMode === 1 ? 2.0 : 2.5));
        let delayCharged = isRNG ? (1.5 + (Math.random() + Math.random()) / 2) : (determMode === 0 ? 2.0 : (determMode === 1 ? 2.5 : 3.0));
        let energyThreshold = isRNG ? bossEnCost : (determMode === 2 ? 100 : bossEnCost);

        let tBossFastTime = (parseFloat(bFast.duration) || (bFast.cooldown ? bFast.cooldown / 1000 : 1.0)) + delayFast;
        let tBossChargedTime = (parseFloat(bCharged.duration) || (bCharged.cooldown ? bCharged.cooldown / 1000 : 2.0)) + delayCharged;

        let hpBoss = oponente.baseStats.hp; let hpAtual = attackerHPMax; let energiaAtacante = 0; let energiaBoss = 0;
        let relogio = 0; let proxAcaoAtacante = 0; let proxAcaoBoss = isRNG ? (1.5 + (Math.random() + Math.random()) / 2) : 1.0;
        let mortesTotais = 0; let danoAos300s = 0; let hpRecorded = false; let limitadorInfinito = 0;
        let countBossCharged = 0;

        while (hpBoss > 0 && limitadorInfinito < 20000) {
            limitadorInfinito++;
            let proximoEvento = Math.min(proxAcaoAtacante, proxAcaoBoss);
            if (!hpRecorded && proximoEvento >= tempoMaximoRaid) { danoAos300s = oponente.baseStats.hp - hpBoss; hpRecorded = true; }
            if (proximoEvento < relogio) proximoEvento = relogio;
            relogio = proximoEvento;

            if (relogio > 2000) { hpBoss = 0; break; }

            if (hpAtual > 0 && relogio >= proxAcaoAtacante) {
                let danoCausado = 0;
                if (energiaAtacante >= enCost) { danoCausado = Math.min(hpBoss, dmgCharged); energiaAtacante -= enCost; proxAcaoAtacante = relogio + tCharged; } 
                else { danoCausado = Math.min(hpBoss, dmgFast); energiaAtacante += enGain; proxAcaoAtacante = relogio + tFast; }
                hpBoss -= danoCausado; energiaBoss += Math.ceil(danoCausado * 0.1); 
                if (energiaAtacante > 100) energiaAtacante = 100; if (energiaBoss > 100) energiaBoss = 100;
            }
            else if (relogio >= proxAcaoBoss) {
                let usaCarregado = isRNG ? (energiaBoss >= bossEnCost && Math.random() < 0.5) : (energiaBoss >= energyThreshold);
                if (usaCarregado) { 
                    hpAtual -= dmgBossCharged; energiaBoss -= bossEnCost; proxAcaoBoss = relogio + tBossChargedTime; energiaAtacante += Math.ceil(dmgBossCharged * 0.5); countBossCharged++; 
                } else { 
                    hpAtual -= dmgBossFast; energiaBoss += bossEnGain; proxAcaoBoss = relogio + tBossFastTime; energiaAtacante += Math.ceil(dmgBossFast * 0.5); 
                }
                if (energiaAtacante > 100) energiaAtacante = 100;
            }

            if (hpAtual <= 0 && hpBoss > 0) {
                mortesTotais++; hpAtual = attackerHPMax; energiaAtacante = 0; 
                relogio += 1.0; proxAcaoAtacante = relogio + 0.5; proxAcaoBoss = Math.max(proxAcaoBoss, relogio); 
                if (mortesTotais % 6 === 0) { relogio += 15; energiaBoss = 0; proxAcaoBoss = relogio + 2.0; proxAcaoAtacante = relogio + 0.5; }
            }
        }
        if (!hpRecorded) danoAos300s = oponente.baseStats.hp;

        const dps = oponente.baseStats.hp / relogio; 
        const tdo = dps * (relogio / Math.max(1, mortesTotais));
        return { 
            dps, mortes: mortesTotais, tdo, estimador: relogio / tempoMaximoRaid, 
            danoPerc: (danoAos300s / oponente.baseStats.hp) * 100, ttw: relogio, 
            ER: Math.pow(Math.pow(dps, 3) * tdo, 0.25), bossUsesC: countBossCharged, bossDmgPerc: (dmgBossCharged / attackerHPMax) * 100 
        };
    };
}

function rodarMonteCarlo(simularFn, qtdLutas) {
    let sumDPS = 0, sumTDO = 0, sumEst = 0, sumMortes = 0, sumDP = 0, sumTTW = 0, sumBossUses = 0;
    let minDps = 999, maxDps = 0, minMortes = 999, maxMortes = 0, minEst = 999, maxEst = 0, minTdo = 999, maxTdo = 0;
    let bDmg = 0;

    for(let i=0; i < qtdLutas; i++){
        let r = simularFn(1, true); 
        sumDPS += r.dps; sumTDO += r.tdo; sumEst += r.estimador; sumMortes += r.mortes; sumDP += r.danoPerc; sumTTW += r.ttw;
        sumBossUses += r.bossUsesC; 
        
        if (i === 0) bDmg = r.bossDmgPerc; 

        if(r.dps < minDps) minDps = r.dps; if(r.dps > maxDps) maxDps = r.dps;
        if(r.mortes < minMortes) minMortes = r.mortes; if(r.mortes > maxMortes) maxMortes = r.mortes;
        if(r.estimador < minEst) minEst = r.estimador; if(r.estimador > maxEst) maxEst = r.estimador;
        if(r.tdo < minTdo) minTdo = r.tdo; if(r.tdo > maxTdo) maxTdo = r.tdo;
    }

    let dpsM = sumDPS/qtdLutas; let tdoM = sumTDO/qtdLutas;
    return {
        d: parseFloat(dpsM.toFixed(2)), d0: parseFloat(minDps.toFixed(2)), d1: parseFloat(maxDps.toFixed(2)),
        dp: parseFloat((sumDP/qtdLutas).toFixed(1)),
        m: Math.round(sumMortes/qtdLutas), m0: minMortes, m1: maxMortes,
        td: parseFloat(tdoM.toFixed(0)), td0: parseFloat(minTdo.toFixed(0)), td1: parseFloat(maxTdo.toFixed(0)),
        e: parseFloat((sumEst/qtdLutas).toFixed(2)), e0: parseFloat(minEst.toFixed(2)), e1: parseFloat(maxEst.toFixed(2)),
        tw: parseFloat((sumTTW/qtdLutas).toFixed(1)),
        er: parseFloat(Math.pow(Math.pow(dpsM, 3) * tdoM, 0.25).toFixed(2)),
        bu: parseFloat((sumBossUses/qtdLutas).toFixed(1)), 
        bd: parseFloat(bDmg.toFixed(1)) 
    };
}

function analisarFilaTxt() {
    if (!fs.existsSync(arquivoFila)) {
        registrarLog(`❌ ERRO: O arquivo '${arquivoFila}' não foi encontrado.`);
        return [];
    }
    const txt = fs.readFileSync(arquivoFila, 'utf8');
    const tarefas = [];
    const regexBloco = /"speciesName"\s*:\s*"([^"]+)"[\s\S]*?novo\s+([^\n]+)/gi;
    let match;

    while ((match = regexBloco.exec(txt)) !== null) {
        const speciesName = match[1];
        const movesText = match[2];
        const novosMoves = [...movesText.matchAll(/"([^"]+)"/g)].map(m => m[1].toUpperCase().trim());
        if (novosMoves.length > 0) tarefas.push({ speciesName, novosMoves });
    }
    return tarefas;
}

// ====================================================================
// 👑 ETAPA 1: O PÊNTUPLO FUNIL (EXATAMENTE COMO O V10 ORIGINAL)
// ====================================================================
function atualizarEleComoBoss(novosFast, novosCharged, arquivosDoBoss) {
    if (arquivosDoBoss.length === 0) return;
    
    registrarLog(`\n👑 [ETAPA 1] Reconstruindo arquivos do Boss 100% do zero (BRUTE FORCE V10):\n   - ${arquivosDoBoss.join('\n   - ')}`);

    for (const arquivo of arquivosDoBoss) {
        const partes = arquivo.replace("counters_", "").replace(".json", "").split("_t");
        if (partes.length < 2) continue;
        
        const nomeLimpoBossNoArquivo = partes[0]; 
        const tier = partes[1];
        
        let bossRealObj = GLOBAL_POKE_DB.todosOsPokemons.find(p => p.speciesName.toLowerCase().replace(/ /g, "_") === nomeLimpoBossNoArquivo);
        if (!bossRealObj) continue;

        const arquivoSaida = path.join(pastaDestino, arquivo);
        const pastaTemp = path.join(pastaDestino, `_temp_${nomeLimpoBossNoArquivo}_t${tier}`);
        let dadosAgrupadosDoBoss = {};

        // Cria a pasta temporária de fragmentos do V10
        if (!fs.existsSync(pastaTemp)) fs.mkdirSync(pastaTemp, { recursive: true });
        
        const configRaid = raidConfigs[tier] || raidConfigs["5"];

        // Junta os golpes antigos com os novos
        let fastBossGeral = [...new Set([...(bossRealObj.fastMoves || []), ...novosFast])];
        let chargedBossGeral = [...new Set([...(bossRealObj.chargedMoves || []), ...novosCharged])];

        // 🧠 MONTA OS CENÁRIOS
        const cenariosDeLuta = [{ sufixoArquivo: "average", fastMoves: fastBossGeral, chargedMoves: chargedBossGeral }];
        fastBossGeral.forEach(fId => chargedBossGeral.forEach(cId => cenariosDeLuta.push({ sufixoArquivo: `${fId}_${cId}`.toLowerCase(), fastMoves: [fId], chargedMoves: [cId] })));

        for (let c = 0; c < cenariosDeLuta.length; c++) {
            const cenario = cenariosDeLuta[c];
            const arquivoCenarioTemp = path.join(pastaTemp, `${cenario.sufixoArquivo}.json`);
            
            // CHECKPOINT V10
            if (fs.existsSync(arquivoCenarioTemp)) {
                const pctGeral = ((c / cenariosDeLuta.length) * 100).toFixed(2).replace('.', ',');
                console.log(`-----------------------------------${pctGeral}%-------------------------------------------`);
                console.log(`⏭️ [PULANDO COMBO] Arquivo '${cenario.sufixoArquivo}.json' já existe na pasta temporária.`);
                continue;
            }

            const pctGeral = ((c / cenariosDeLuta.length) * 100).toFixed(2).replace('.', ',');
            console.log(`-----------------------------------${pctGeral}%-------------------------------------------`);
            
            const oponenteRaid = { tipos: bossRealObj.types || ["Normal"], baseStats: { atk: bossRealObj.baseStats.atk, def: bossRealObj.baseStats.def, hp: configRaid.hp }, fastMoves: cenario.fastMoves, chargedMoves: cenario.chargedMoves };

            // 🚪 FASE 1: MOTOR 6.0
            let resultadosM6 = [];
            let c1 = 0;
            ATACANTES_VIP.forEach(atacante => {
                c1++; if (c1 % 10 === 0 || c1 === ATACANTES_VIP.length) desenharBarra(c1, ATACANTES_VIP.length, '🔍', `Fase 1 (M6)`);
                if (atacante.speciesId === bossRealObj.speciesId) return;

                (atacante.fastMoves || []).forEach(fId => {
                    (atacante.chargedMoves || []).forEach(cId => {
                        const simular = instanciarCombate(atacante, oponenteRaid, fId, cId, configRaid.tempo);
                        if(simular) {
                            let pior = simular(0, false); let medio = simular(1, false); let melhor = simular(2, false);
                            resultadosM6.push({
                                hash: `${atacante.speciesId}_${fId}_${cId}`, id: atacante.speciesId, f: fId, c: cId,
                                eMedio: medio.estimador, er: medio.ER, dMax: melhor.dps, dp: medio.danoPerc, tdoMax: melhor.tdo, ttw: medio.ttw, mMin: melhor.mortes
                            });
                        }
                    });
                });
            });
            console.log(); 

            let aprovadosM6 = new Map();
            const add500 = (lista) => lista.slice(0, 500).forEach(combo => aprovadosM6.set(combo.hash, combo));
            add500([...resultadosM6].sort((a, b) => a.eMedio - b.eMedio)); add500([...resultadosM6].sort((a, b) => b.er - a.er));         
            add500([...resultadosM6].sort((a, b) => b.dMax - a.dMax));     add500([...resultadosM6].sort((a, b) => b.dp - a.dp));         
            add500([...resultadosM6].sort((a, b) => b.tdoMax - a.tdoMax)); add500([...resultadosM6].sort((a, b) => a.ttw - b.ttw));       
            add500([...resultadosM6].sort((a, b) => a.mMin - b.mMin));     
            const listaM7 = Array.from(aprovadosM6.values());

            // 🎲 FASE 2: MOTOR 7.0
            let resultadosM7 = [];
            let c2 = 0;
            listaM7.forEach(combo => {
                c2++; if (c2 % 5 === 0 || c2 === listaM7.length) desenharBarra(c2, listaM7.length, '🎲', `Fase 2 (M7)`);
                const atacanteObj = ATACANTES_VIP.find(p => p.speciesId === combo.id);
                const simular = instanciarCombate(atacanteObj, oponenteRaid, combo.f, combo.c, configRaid.tempo);
                if(simular) {
                    const m7Data = rodarMonteCarlo(simular, 20); 
                    m7Data.hash = combo.hash; m7Data.id = combo.id; m7Data.f = combo.f; m7Data.c = combo.c;
                    resultadosM7.push(m7Data);
                }
            });
            console.log();

            let aprovadosM7 = new Map();
            const add250 = (lista) => lista.slice(0, 250).forEach(combo => aprovadosM7.set(combo.hash, combo));
            add250([...resultadosM7].sort((a, b) => a.e - b.e));   add250([...resultadosM7].sort((a, b) => b.er - a.er)); 
            add250([...resultadosM7].sort((a, b) => b.d1 - a.d1)); add250([...resultadosM7].sort((a, b) => b.dp - a.dp)); 
            add250([...resultadosM7].sort((a, b) => b.td1 - a.td1)); add250([...resultadosM7].sort((a, b) => a.tw - b.tw)); 
            add250([...resultadosM7].sort((a, b) => a.m0 - b.m0)); 
            const listaM8 = Array.from(aprovadosM7.values());

            // 💎 FASE 3: MOTOR 8.0
            let resultadosM8 = [];
            let c3 = 0;
            listaM8.forEach(combo => {
                c3++; if (c3 % 5 === 0 || c3 === listaM8.length) desenharBarra(c3, listaM8.length, '💎', `Fase 3 (M8)`);
                const atacanteObj = ATACANTES_VIP.find(p => p.speciesId === combo.id);
                const simular = instanciarCombate(atacanteObj, oponenteRaid, combo.f, combo.c, configRaid.tempo);
                if(simular) {
                    const m8Data = rodarMonteCarlo(simular, 100); 
                    m8Data.hash = combo.hash; m8Data.id = combo.id; m8Data.f = combo.f; m8Data.c = combo.c;
                    resultadosM8.push(m8Data);
                }
            });
            console.log();

            let aprovadosM8 = new Map();
            const add125 = (lista) => lista.slice(0, 125).forEach(combo => aprovadosM8.set(combo.hash, combo));
            add125([...resultadosM8].sort((a, b) => a.e - b.e));   add125([...resultadosM8].sort((a, b) => b.er - a.er)); 
            add125([...resultadosM8].sort((a, b) => b.d1 - a.d1)); add125([...resultadosM8].sort((a, b) => b.dp - a.dp)); 
            add125([...resultadosM8].sort((a, b) => b.td1 - a.td1)); add125([...resultadosM8].sort((a, b) => a.tw - b.tw)); 
            add125([...resultadosM8].sort((a, b) => a.m0 - b.m0)); 
            const listaM9 = Array.from(aprovadosM8.values());

            // 👑 FASE 4: MOTOR 9.0
            let resultadosM9 = [];
            let c4 = 0;
            listaM9.forEach(combo => {
                c4++; if (c4 % 3 === 0 || c4 === listaM9.length) desenharBarra(c4, listaM9.length, '👑', `Fase 4 (M9)`);
                const atacanteObj = ATACANTES_VIP.find(p => p.speciesId === combo.id);
                const simular = instanciarCombate(atacanteObj, oponenteRaid, combo.f, combo.c, configRaid.tempo);
                if(simular) {
                    const m9Data = rodarMonteCarlo(simular, 250); 
                    m9Data.hash = combo.hash; m9Data.id = combo.id; m9Data.f = combo.f; m9Data.c = combo.c;
                    resultadosM9.push(m9Data);
                }
            });
            console.log();

            let aprovadosM9 = new Map();
            const add60 = (lista) => lista.slice(0, 60).forEach(combo => aprovadosM9.set(combo.hash, combo));
            add60([...resultadosM9].sort((a, b) => a.e - b.e));   add60([...resultadosM9].sort((a, b) => b.er - a.er)); 
            add60([...resultadosM9].sort((a, b) => b.d1 - a.d1)); add60([...resultadosM9].sort((a, b) => b.dp - a.dp)); 
            add60([...resultadosM9].sort((a, b) => b.td1 - a.td1)); add60([...resultadosM9].sort((a, b) => a.tw - b.tw)); 
            add60([...resultadosM9].sort((a, b) => a.m0 - b.m0)); 
            const listaM10 = Array.from(aprovadosM9.values());

            // 🔥 FASE 5: MOTOR 10.0 (O DEUS EX MACHINA)
            let resultadosFinais = [];
            let c5 = 0;
            listaM10.forEach(combo => {
                c5++; if (c5 % 2 === 0 || c5 === listaM10.length) desenharBarra(c5, listaM10.length, '🔥', `Fase 5 (M10)`);
                
                const atacanteObj = ATACANTES_VIP.find(p => p.speciesId === combo.id);
                const simular = instanciarCombate(atacanteObj, oponenteRaid, combo.f, combo.c, configRaid.tempo);
                
                if(simular) {
                    const m10Data = rodarMonteCarlo(simular, 550); 
                    
                    const atk = (atacanteObj.baseStats.atk || 10) + 15;
                    const def = (atacanteObj.baseStats.def || 10) + 15;
                    const hp = (atacanteObj.baseStats.hp || 10) + 15;
                    const cp40 = Math.floor((atk * Math.sqrt(def) * Math.sqrt(hp) * (0.7903 * 0.7903)) / 10);

                    resultadosFinais.push({
                        i: atacanteObj.speciesId, n: atacanteObj.speciesName, f: combo.f.replace("_FAST", ""), c: combo.c, cp: cp40, lv: 40, ...m10Data
                    });
                }
            });
            console.log();

            // 🌟 AQUI ESTÁ A LÓGICA RICA DO V10: SALVA OS CAMPEÕES DE TODAS AS 5 MÉTRICAS!
            let aprovadosTop30 = new Map();
            const agruparEAdicionar = (listaOrdenada) => {
                const agrupado = {};
                listaOrdenada.forEach(c => {
                    if (!agrupado[c.i]) agrupado[c.i] = { melhor: c, todos: [] };
                    agrupado[c.i].todos.push(c);
                });
                const top30 = Object.values(agrupado).slice(0, 30);
                top30.forEach(p => p.todos.forEach(combo => aprovadosTop30.set(`${combo.i}_${combo.f}_${combo.c}`, combo)));
            };

            agruparEAdicionar([...resultadosFinais].sort((a, b) => a.e - b.e));       // Melhor Estimador
            agruparEAdicionar([...resultadosFinais].sort((a, b) => b.er - a.er));     // Melhor Nota Geral (ER)
            agruparEAdicionar([...resultadosFinais].sort((a, b) => b.d1 - a.d1));     // Maior DPS Absoluto
            agruparEAdicionar([...resultadosFinais].sort((a, b) => b.td1 - a.td1));   // Maior TDO (Tanque)
            agruparEAdicionar([...resultadosFinais].sort((a, b) => a.tw - b.tw));     // Mais Rápido (TTW)

            let jsonGaveta = Array.from(aprovadosTop30.values());
            jsonGaveta.sort((a, b) => a.e - b.e);
            
            // Salva o checkpoint na pasta temp
            fs.writeFileSync(arquivoCenarioTemp, JSON.stringify(jsonGaveta));
        }

        console.log(`-----------------------------------100,00%-------------------------------------------`);
        
        // 🧹 FINALIZAÇÃO (SHARDING PARA BOSSES PESADOS)
        const totalDeCombos = cenariosDeLuta.length;
        const isHeavyBoss = totalDeCombos > 400;

        if (isHeavyBoss) {
            console.log(`\n📦 MODO PASTA ATIVADO: Boss pesado. Mantendo fragmentos separados...`);
            const pastaOficial = path.join(pastaDestino, `counters_${nomeLimpoBossNoArquivo}_t${tier}_moves`);
            if (fs.existsSync(pastaOficial)) fs.rmSync(pastaOficial, { recursive: true, force: true });
            fs.renameSync(pastaTemp, pastaOficial);

            // Salva só o average no arquivo principal
            try {
                const fragAverage = JSON.parse(fs.readFileSync(path.join(pastaOficial, 'average.json'), 'utf8'));
                fs.writeFileSync(arquivoSaida, JSON.stringify({ "average": fragAverage }));
            } catch(e) {}
            
        } else {
            console.log(`\n📦 MODO ARQUIVO ÚNICO: Juntando os fragmentos...`);
            const arquivosFragmentos = fs.readdirSync(pastaTemp);
            
            for (let arq of arquivosFragmentos) {
                if (arq.endsWith('.json')) {
                    const chaveCenario = arq.replace('.json', '');
                    const caminhoFrag = path.join(pastaTemp, arq);
                    try {
                        dadosAgrupadosDoBoss[chaveCenario] = JSON.parse(fs.readFileSync(caminhoFrag, 'utf8'));
                    } catch(e) {}
                }
            }

            fs.writeFileSync(arquivoSaida, JSON.stringify(dadosAgrupadosDoBoss)); 
            try { fs.rmSync(pastaTemp, { recursive: true, force: true }); } catch(e) {}
        }

        atualizarDiarioDeBordo();
        registrarLog(`      💾 Arquivo de Boss [${arquivo}] atualizado com métricas V10 e Checkpoint!`);
    }
}

// ====================================================================
// ⚔️ ETAPA 2: O FUNIL DE ABORTO RÁPIDO DO ATACANTE
// ====================================================================
function avaliarPokemonContraRaides(atacanteObj, novosFast, novosCharged, historico, chaveUnica) {
    const cp40 = Math.floor((((atacanteObj.baseStats.atk || 10) + 15) * Math.sqrt((atacanteObj.baseStats.def || 10) + 15) * Math.sqrt((atacanteObj.baseStats.hp || 10) + 15) * (0.7903 * 0.7903)) / 10);
    
    let fastMovesTestar = [...new Set([...(atacanteObj.fastMoves || []), ...novosFast])];
    let chargedMovesTestar = [...new Set([...(atacanteObj.chargedMoves || []), ...novosCharged])];

    const arquivosRaide = fs.readdirSync(pastaDestino).filter(file => file.endsWith('.json'));
    
    const nomeBossBase = atacanteObj.speciesName.toLowerCase().replace(/ /g, "_");
    const arquivosOndeEleEBoss = arquivosRaide.filter(f => f.startsWith(`counters_${nomeBossBase}_`) || f === `counters_${nomeBossBase}.json`);

    const planejamentoVisual = {
        "speciesName": atacanteObj.speciesName,
        "fastMoves": novosFast.length > 0 ? novosFast : [""],
        "chargedMoves": novosCharged.length > 0 ? novosCharged : [""],
        "arquivos boss para atualizar": arquivosOndeEleEBoss.length > 0 ? arquivosOndeEleEBoss : ["Nenhum arquivo encontrado"],
        "boss": "atualizado"
    };

    registrarLog(`\n📋 PLANEJAMENTO DE TAREFA:\n${JSON.stringify(planejamentoVisual, null, 4)}\n`);

    if (historico[chaveUnica] && historico[chaveUnica].status_boss !== "concluido") {
        atualizarEleComoBoss(novosFast, novosCharged, arquivosOndeEleEBoss);
        historico[chaveUnica].status_boss = "concluido";
        salvarHistorico(historico);
    }

    let startIndex = (historico[chaveUnica].last_index || 0);
    let rankingsAlcancados = historico[chaveUnica].rankingsAlcancados || 0;
    
    if (startIndex > 0) registrarLog(`   🔄 RETOMANDO PROCESSO: Começando do chefe #${startIndex + 1}...`);
    else registrarLog(`   ⚔️ [ETAPA 2] Iniciando o Funil de Aborto Rápido (Apenas combinações com novos ataques)...`);

    const combinacoesParaTestar = [];
    const todosFast = [...new Set([...(atacanteObj.fastMoves || []), ...novosFast])];
    const todosCharged = [...new Set([...(atacanteObj.chargedMoves || []), ...novosCharged])];

    for (const fId of todosFast) {
        for (const cId of todosCharged) {
            if (novosFast.includes(fId) || novosFast.includes(fId.replace("_FAST", "")) || novosCharged.includes(cId)) {
                combinacoesParaTestar.push({ fId, cId });
            }
        }
    }

    if (combinacoesParaTestar.length === 0) {
         registrarLog(`   ⚠️ Nenhuma combinação nova para testar na Etapa 2. Finalizando.`);
         return;
    }

    for (let i = startIndex; i < arquivosRaide.length; i++) {
        const arquivo = arquivosRaide[i];
        const partes = arquivo.replace("counters_", "").replace(".json", "").split("_t");
        if (partes.length < 2) continue;

        let nomeLimpoBoss = partes[0].replace(/_/g, " ");
        const tier = partes[1];
        
        let bossObj = GLOBAL_POKE_DB.todosOsPokemons.find(p => p.speciesName.toLowerCase() === nomeLimpoBoss);
        if (!bossObj) bossObj = GLOBAL_POKE_DB.todosOsPokemons.find(p => p.speciesName.toLowerCase().replace(/ /g, "_") === partes[0]);
        if (!bossObj) continue;

        const configRaid = raidConfigs[tier] || raidConfigs["5"];
        const caminhoCompleto = path.join(pastaDestino, arquivo);
        let dadosJSON = JSON.parse(fs.readFileSync(caminhoCompleto, 'utf8'));
        let alterouArquivo = false;

        const msgProgresso = `   ⚔️ [${atacanteObj.speciesName}] Testando barreiras vs ${bossObj.speciesName} (${i + 1}/${arquivosRaide.length})...`;
        process.stdout.write(`\r${msgProgresso.padEnd(80)}`);

        for (const categoria in dadosJSON) {
            let listaCounters = dadosJSON[categoria];
            if (listaCounters.length === 0) continue;

            const isListaPequena = listaCounters.length < 30;
            const piorEstimadorAtual = isListaPequena ? 999 : listaCounters[listaCounters.length - 1].e;

            let bFast = bossObj.fastMoves && bossObj.fastMoves.length > 0 ? bossObj.fastMoves : ["TACKLE_FAST"];
            let bCharged = bossObj.chargedMoves && bossObj.chargedMoves.length > 0 ? bossObj.chargedMoves : ["STRUGGLE"];
            
            if (categoria !== "average") {
                const movesInCat = categoria.split("_");
                const mF = bossObj.fastMoves.find(m => m.toLowerCase().includes(movesInCat[0]));
                const mC = bossObj.chargedMoves.find(m => m.toLowerCase().includes(movesInCat[movesInCat.length-1]));
                if (mF) bFast = [mF];
                if (mC) bCharged = [mC];
            }

            const oponenteRaid = { tipos: bossObj.types || ["Normal"], baseStats: { atk: bossObj.baseStats.atk, def: bossObj.baseStats.def, hp: configRaid.hp }, fastMoves: bFast, chargedMoves: bCharged };
            
            let combosAprovados = [];
            let fezNovaAdicao = false; 

            for (const combo of combinacoesParaTestar) {
                const { fId, cId } = combo;
                const fClean = fId.replace("_FAST", "");
                
                const comboExistente = listaCounters.find(c => c.i === atacanteObj.speciesId && c.f === fClean && c.c === cId);
                if (comboExistente) continue; 

                const simular = instanciarCombate(atacanteObj, oponenteRaid, fId, cId, configRaid.tempo);
                if (!simular) continue;

                let simMedio = simular(1, false);
                if (!isListaPequena && simMedio.estimador > piorEstimadorAtual * 1.4) continue; 

                let r20 = rodarMonteCarlo(simular, 20);
                if (!isListaPequena && r20.e > piorEstimadorAtual * 1.2) continue;

                let r100 = rodarMonteCarlo(simular, 100);
                if (!isListaPequena && r100.e > piorEstimadorAtual * 1.05) continue;

                let r250 = rodarMonteCarlo(simular, 250);
                if (!isListaPequena && r250.e > piorEstimadorAtual * 1.02) continue;

                let m10Data = rodarMonteCarlo(simular, 550);
                
                if (m10Data.e < piorEstimadorAtual || isListaPequena) {
                    combosAprovados.push({ i: atacanteObj.speciesId, n: atacanteObj.speciesName, f: fClean, c: cId, cp: cp40, lv: 40, ...m10Data });
                    fezNovaAdicao = true;
                }
            }

            if (fezNovaAdicao) {
                listaCounters.push(...combosAprovados);
                listaCounters.sort((a, b) => a.e - b.e);
                
                const combosVistos = new Set();
                listaCounters = listaCounters.filter(c => {
                    const chaveExata = `${c.i}_${c.f}_${c.c}`;
                    if (combosVistos.has(chaveExata)) return false;
                    combosVistos.add(chaveExata);
                    return true;
                });
                
                dadosJSON[categoria] = listaCounters;
                alterouArquivo = true;

                const novaPosicao = listaCounters.findIndex(c => c.i === atacanteObj.speciesId) + 1;
                console.log(`\n      ✅ SUCESSO! Passou nas barreiras e pegou Top ${novaPosicao} contra [${bossObj.speciesName} - ${categoria}]`);
                fs.appendFileSync(arquivoRelatorio, `      ✅ SUCESSO! Passou nas barreiras e pegou Top ${novaPosicao} contra [${bossObj.speciesName} - ${categoria}]\n`, 'utf8');
                rankingsAlcancados++;
            }
        }

        if (alterouArquivo) {
            fs.writeFileSync(caminhoCompleto, JSON.stringify(dadosJSON));
        }

        if (i > 0 && i % 50 === 0) {
            historico[chaveUnica].last_index = i;
            historico[chaveUnica].rankingsAlcancados = rankingsAlcancados;
            salvarHistorico(historico);
        }
    }

    console.log(""); 
    historico[chaveUnica].status_atacante = "concluido";
    historico[chaveUnica].rankingsAlcancados = rankingsAlcancados;
    salvarHistorico(historico);

    registrarLog(`   🏆 TAREFA FINALIZADA! O ${atacanteObj.speciesName} entrou em ${rankingsAlcancados} rankings de Raide.`);
}

// 3️⃣ INICIAR O PROCESSAMENTO EM LOTE
async function iniciarMotorLote() {
    iniciarRelatorio(); 
    let historico = carregarHistorico(); 
    
    const filaTarefas = analisarFilaTxt();
    if (filaTarefas.length === 0) {
        registrarLog("❌ Nenhuma atualização encontrada no atualizar.txt.");
        return;
    }

    registrarLog("\n📥 Baixando Banco de Dados do GitHub...");
    try {
        const [resPokes, resMega, resGiga, resEf, resFast, resCharged, resMoves] = await Promise.all([ 
            fetch(URLS.MAIN_DATA).then(r => r.json()), fetch(URLS.MEGA_DATA).then(r => r.json()), 
            fetch(URLS.GIGAMAX_DATA).then(r => r.json()), fetch(URLS.TYPE_EFFECTIVENESS).then(r => r.json()), 
            fetch(URLS.MOVES_GYM_FAST).then(r => r.json()), fetch(URLS.MOVES_GYM_CHARGED).then(r => r.json()), 
            fetch(URLS.MOVE_DATA).then(r => r.json()) 
        ]);
        
        GLOBAL_POKE_DB = { 
            todosOsPokemons: [...resPokes, ...resMega, ...resGiga], 
            dadosEficacia: resEf, 
            gymFastMap: new Map(resFast.map(m => [m.moveId, m])), 
            gymChargedMap: new Map(resCharged.map(m => [m.moveId, m])), 
            moveDataObjMap: new Map(resMoves.map(m => [m.moveId, m])) 
        };

        ATACANTES_VIP = GLOBAL_POKE_DB.todosOsPokemons.filter(a => {
            if (!a || !a.baseStats || a.speciesName.includes("Purified") || a.speciesName === "Smeargle" || a.speciesName === "Ditto") return false;
            const maxCP = Math.floor((((a.baseStats.atk || 10) + 15) * Math.sqrt((a.baseStats.def || 10) + 15) * Math.sqrt((a.baseStats.hp || 10) + 15) * (0.8403 * 0.8403)) / 10);
            return maxCP >= 2000 || a.baseStats.atk >= 200; 
        });

    } catch (e) {
        registrarLog(`❌ ERRO: Falha ao baixar os dados do GitHub. (${e.message})`);
        return;
    }

    for (let i = 0; i < filaTarefas.length; i++) {
        const tarefa = filaTarefas[i];
        const ataquesOrdenados = [...tarefa.novosMoves].sort().join(",");
        const chaveUnica = `${tarefa.speciesName}___${ataquesOrdenados}`;

        if (!historico[chaveUnica]) {
            historico[chaveUnica] = { status_boss: "pendente", status_atacante: "pendente", last_index: 0, rankingsAlcancados: 0 };
        }

        if (historico[chaveUnica].status_atacante === "concluido") {
            registrarLog(`\n⏭️  PULANDO: A tarefa do ${tarefa.speciesName} [${ataquesOrdenados}] já está 100% concluída!`);
            continue;
        }

        const atacanteObj = GLOBAL_POKE_DB.todosOsPokemons.find(p => p.speciesName === tarefa.speciesName);
        
        const novosFast = [];
        const novosCharged = [];
        for (const golpe of tarefa.novosMoves) {
            if (GLOBAL_POKE_DB.gymFastMap.has(golpe) || GLOBAL_POKE_DB.gymFastMap.has(golpe + "_FAST")) novosFast.push(golpe);
            else novosCharged.push(golpe);
        }

        avaliarPokemonContraRaides(atacanteObj, novosFast, novosCharged, historico, chaveUnica);
    }

    registrarLog(`\n🎉 MOTOR DELTA V10 FINALIZOU TODA A FILA COM SUCESSO!`);
}

iniciarMotorLote();