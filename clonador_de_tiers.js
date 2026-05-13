const fs = require('fs');
const path = require('path');

// ============================================================================
// 🧬 CLONADOR MATEMÁTICO DE TIERS (EXTRAPOLAÇÃO DE DADOS)
// ============================================================================

const pastaDestino = path.join(__dirname, 'json', 'simulacao_pve10');
const nomeDoBoss = "smeargle"; // Altere se for usar para outro Pokémon
const tierOrigem = "1"; // O Tier que você já calculou (Base)

// Configurações Oficiais das Tiers
const raidConfigs = {
    "1": { hp: 600, tempo: 180 },
    "3": { hp: 3600, tempo: 180 },
    "5": { hp: 15000, tempo: 300 },
    "mega": { hp: 9000, tempo: 300 }
};

const tiersParaGerar = ["3", "5", "mega"]; // As Tiers que você quer criar instantaneamente

console.log("========================================================");
console.log(`🧬 CLONADOR MÁGICO ATIVADO PARA: ${nomeDoBoss.toUpperCase()}`);
console.log("========================================================\n");

// 1. Verifica se a pasta Base (T1) existe
const pastaBase = path.join(pastaDestino, `counters_${nomeDoBoss}_t${tierOrigem}_moves`);
if (!fs.existsSync(pastaBase)) {
    console.error(`❌ ERRO: A pasta base '${pastaBase}' não existe. Termine a simulação do Tier 1 primeiro!`);
    process.exit(1);
}

const arquivosFragmentos = fs.readdirSync(pastaBase).filter(arq => arq.endsWith('.json'));
console.log(`📂 Lendo ${arquivosFragmentos.length} cenários de batalha da Tier ${tierOrigem}...`);

// 2. O Loop da Clonagem
for (const novaTier of tiersParaGerar) {
    const configNova = raidConfigs[novaTier];
    if (!configNova) continue;

    console.log(`\n⏳ Clonando e calculando matemática para a Tier [${novaTier}] (HP: ${configNova.hp} | Tempo: ${configNova.tempo}s)...`);

    // Cria a nova pasta fragmentada
    const novaPastaMoves = path.join(pastaDestino, `counters_${nomeDoBoss}_t${novaTier}_moves`);
    if (!fs.existsSync(novaPastaMoves)) fs.mkdirSync(novaPastaMoves, { recursive: true });

    let averageSalvo = null;

    // Processa cada arquivo de golpe
    for (const arq of arquivosFragmentos) {
        const caminhoOriginal = path.join(pastaBase, arq);
        const caminhoNovo = path.join(novaPastaMoves, arq);

        const dadosT1 = JSON.parse(fs.readFileSync(caminhoOriginal, 'utf8'));

        // 🧮 A MÁGICA DA MATEMÁTICA ACONTECE AQUI
        const dadosExtrapolados = dadosT1.map(c => {
            // Se o TDO ou DPS forem muito baixos, evita divisão por zero
            const tdoSeguro = Math.max(1, c.td);
            const dpsSeguro = Math.max(0.1, c.d);

            // 1. Calcula as novas mortes necessárias para derrubar o HP gigante
            const novoMortes = configNova.hp / tdoSeguro;

            // 2. Calcula o tempo batendo + penalidades (2s por morte, 15s por wipe de time)
            const novoTempoBatendo = configNova.hp / dpsSeguro;
            const novoWipes = Math.floor(novoMortes / 6);
            const novoTTW = novoTempoBatendo + (novoMortes * 2.0) + (novoWipes * 15.0);

            // 3. O Estimador é o TTW dividido pelo tempo limite da Reide
            const novoEstimador = novoTTW / configNova.tempo;

            // 4. Porcentagem de Dano que 1 time inteiro causa
            const novoDP = Math.min(100, ((c.td * 6) / configNova.hp) * 100);

            // Retorna o objeto atualizado com a matemática da nova Tier
            return {
                ...c, // Copia ID, Nome, Golpes, DPS e TDO (Que não mudam)
                tw: parseFloat(novoTTW.toFixed(1)),
                e: parseFloat(novoEstimador.toFixed(2)),
                e0: parseFloat((novoEstimador * 0.95).toFixed(2)), // Margem de Sorte
                e1: parseFloat((novoEstimador * 1.05).toFixed(2)), // Margem de Azar
                m: Math.ceil(novoMortes),
                m0: Math.max(0, Math.ceil(novoMortes) - 1),
                m1: Math.ceil(novoMortes) + 1,
                dp: parseFloat(novoDP.toFixed(1))
            };
        });

        // Reordena o array baseado no novo Estimador (do menor para o maior)
        dadosExtrapolados.sort((a, b) => a.e - b.e);

        // Salva o fragmento recalculado na nova pasta
        fs.writeFileSync(caminhoNovo, JSON.stringify(dadosExtrapolados));

        // Guarda o "average" para criar o arquivo raiz de atalho
        if (arq === "average.json") {
            averageSalvo = dadosExtrapolados;
        }
    }

    // Cria o arquivo raiz (o atalho para o site carregar a primeira tela rápido)
    if (averageSalvo) {
        const arquivoRaiz = path.join(pastaDestino, `counters_${nomeDoBoss}_t${novaTier}.json`);
        fs.writeFileSync(arquivoRaiz, JSON.stringify({ "average": averageSalvo }));
    }

    console.log(`✅ Tier ${novaTier} finalizada com sucesso!`);
}

console.log("\n🎉 EXTRAPOLAÇÃO CONCLUÍDA! Você economizou dezenas de horas de processamento.");