const fs = require('fs');
const path = require('path');

// CONFIGURAÇÃO DE CAMINHOS
const pastaDestino = path.join(__dirname, 'json', 'simulacao_pve10');
const ficheiroRelatorio = path.join(__dirname, 'relatorio_auditoria.txt');

if (!fs.existsSync(pastaDestino)) {
    console.log("❌ Erro: Pasta 'json/simulacao_pve10' não encontrada!");
    process.exit(1);
}

const arquivos = fs.readdirSync(pastaDestino).filter(f => f.endsWith('.json'));

let logConteudo = `========================================================\n`;
logConteudo += `🕵️ RELATÓRIO DE AUDITORIA DE SANIDADE - MOTOR V10\n`;
logConteudo += `Data: ${new Date().toLocaleString('pt-PT')}\n`;
logConteudo += `Total de arquivos analisados: ${arquivos.length}\n`;
logConteudo += `========================================================\n\n`;

let arquivosComErro = 0;
let totalAnomalias = 0;

console.log("🔍 A analisar arquivos e a gerar relatório... Por favor, aguarda.");

arquivos.forEach(arquivo => {
    const caminho = path.join(pastaDestino, arquivo);
    let dados;
    
    try {
        dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    } catch (e) {
        logConteudo += `🚨 ERRO CRÍTICO: O arquivo [${arquivo}] está corrompido!\n\n`;
        arquivosComErro++;
        return;
    }

    // Extrair a Tier do nome do arquivo
    const matchTier = arquivo.match(/_t(.*?)\.json/);
    const tier = matchTier ? matchTier[1] : "5";
    
    let anomaliasDoArquivo = [];

    // 1. Verificar se a categoria 'average' existe
    if (!dados["average"]) {
        anomaliasDoArquivo.push("ERRO: Categoria 'average' inexistente!");
    }

    // 2. Analisar cada cenário dentro do JSON
    for (const categoria in dados) {
        const lista = dados[categoria];
        if (!Array.isArray(lista) || lista.length === 0) continue;

        const top1 = lista[0]; // Analisamos sempre o melhor para ver se os limites fazem sentido

        // Verificação A: DPS Absurdo (Saitama Bug ou AFK Bug)
        if (top1.d > 120) anomaliasDoArquivo.push(`[${categoria}] DPS impossível: ${top1.d} (${top1.n})`);
        if (top1.d < 0.5) anomaliasDoArquivo.push(`[${categoria}] DPS quase zero: ${top1.d} (${top1.n})`);

        // Verificação B: Imortalidade em Tiers Pesadas
        if (["5", "mega", "mega_lendaria", "primal", "elite"].includes(tier)) {
            if (top1.m === 0 && top1.e > 0.05) {
                anomaliasDoArquivo.push(`[${categoria}] Imortalidade detectada: 0 mortes contra Tier ${tier} (${top1.n})`);
            }
        }

        // Verificação C: Integridade da Fórmula ER (Equivalent Rating)
        // Fórmula: (DPS^3 * TDO)^0.25
        const dps = top1.d;
        const tdo = top1.td;
        const erCalculado = Math.pow(Math.pow(dps, 3) * tdo, 0.25);
        
        if (Math.abs(top1.er - erCalculado) > 2.0) {
            anomaliasDoArquivo.push(`[${categoria}] ER inconsistente: Gravado ${top1.er}, Calculado ${erCalculado.toFixed(2)} (${top1.n})`);
        }

        // Verificação D: Estimador vs DPS (Se o estimador é minúsculo mas o DPS é baixo, algo está errado)
        if (top1.e < 0.1 && top1.d < 20 && tier === "5") {
            anomaliasDoArquivo.push(`[${categoria}] Estimador suspeito: ${top1.e} com apenas ${top1.d} de DPS`);
        }
    }

    if (anomaliasDoArquivo.length > 0) {
        arquivosComErro++;
        totalAnomalias += anomaliasDoArquivo.length;
        logConteudo += `⚠️ FICHEIRO: ${arquivo}\n`;
        anomaliasDoArquivo.forEach(a => {
            logConteudo += `   ➔ ${a}\n`;
        });
        logConteudo += `\n`;
    }
});

logConteudo += `========================================================\n`;
if (arquivosComErro === 0) {
    logConteudo += `✅ RESULTADO: Tudo limpo! Nenhum erro matemático detectado.\n`;
} else {
    logConteudo += `❌ RESULTADO: Foram encontrados problemas em ${arquivosComErro} arquivos.\n`;
    logConteudo += `Total de anomalias detectadas: ${totalAnomalias}\n`;
}
logConteudo += `========================================================\n`;

// GRAVAR O FICHEIRO TXT
fs.writeFileSync(ficheiroRelatorio, logConteudo, 'utf8');

console.log("\n✅ Auditoria finalizada!");
console.log(`📄 Relatório gerado: ${path.basename(ficheiroRelatorio)}`);
if (arquivosComErro > 0) {
    console.log(`🚨 ATENÇÃO: Foram encontrados ${totalAnomalias} problemas. Abre o .txt para ver os detalhes.`);
} else {
    console.log(`💎 Matemática perfeita! Podes confiar nos dados.`);
}