const fs = require('fs');
const path = require('path');

const pastaDestino = path.join(__dirname, 'json', 'simulacao_pve');
const arquivoRelatorio = path.join(__dirname, 'reides_prontas.txt');

console.log("📡 Ligando o radar de arquivos...");

if (!fs.existsSync(pastaDestino)) {
    console.log("⚠️ A pasta 'json/simulacao_pve' não existe ou está vazia.");
    process.exit();
}

// Pega todos os arquivos JSON que começam com "counters_"
const arquivos = fs.readdirSync(pastaDestino).filter(f => f.endsWith('.json') && f.startsWith('counters_'));

// O nosso detector de Boss e Tier usando Expressão Regular (Regex)
const detectorRegex = /^counters_(.+)_t(1|2|3|4|5|mega|mega_lendaria|primal|dmax_1|dmax_3|dmax_5|gmax_6)_(.+)\.json$/;

const dadosAgrupados = {};

arquivos.forEach(arquivo => {
    const match = arquivo.match(detectorRegex);
    if (match) {
        // match[1] é o nome do boss, match[2] é o tier
        let nomeBoss = match[1].replace(/_/g, ' ').toUpperCase(); // Tira os underlines e deixa maiúsculo
        let tier = match[2];

        if (!dadosAgrupados[nomeBoss]) {
            dadosAgrupados[nomeBoss] = new Set(); // Set não permite itens duplicados
        }
        dadosAgrupados[nomeBoss].add(tier);
    }
});

// Monta o visual do arquivo TXT
let textoFinal = "📋 INVENTÁRIO DO SUPER COMPUTADOR (REIDES GERADAS)\n";
textoFinal += "========================================================\n\n";

const listaDeBosses = Object.keys(dadosAgrupados).sort(); // Ordem alfabética

if (listaDeBosses.length === 0) {
    textoFinal += "A sua pasta está vazia. Nenhuma Reide foi gerada ainda.\n";
} else {
    listaDeBosses.forEach(boss => {
        // Transforma o Set de volta em array e organiza
        const tiersProntos = Array.from(dadosAgrupados[boss]).sort().join(', ');
        
        textoFinal += `👑 BOSS: ${boss}\n`;
        textoFinal += `   ✅ Tiers Prontos: [ ${tiersProntos.toUpperCase()} ]\n`;
        textoFinal += `--------------------------------------------------------\n`;
    });
    
    textoFinal += `\nTotal de Bosses mapeados: ${listaDeBosses.length}`;
}

// Salva o arquivo TXT
fs.writeFileSync(arquivoRelatorio, textoFinal);
console.log(`✅ Radar concluído! Abra o arquivo 'reides_prontas.txt' para ver o inventário.`);