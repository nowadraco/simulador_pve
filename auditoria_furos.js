const fs = require('fs');
const path = require('path');

// 📁 ONDE ESTÁ A PASTA PARA INSPECIONAR E ONDE SALVAR O RELATÓRIO
const pastaDestino = path.join(__dirname, 'json', 'simulacao_pve10');
const arquivoAuditoria = path.join(__dirname, 'auditoria_furos.json');

function rodarAuditoria() {
    console.log("========================================================");
    console.log("🕵️  INSPETOR DE QUALIDADE: PROCURANDO BURACOS NAS LISTAS");
    console.log("========================================================\n");

    if (!fs.existsSync(pastaDestino)) {
        console.log("❌ ERRO: A pasta 'simulacao_pve10' não foi encontrada.");
        return;
    }

    const arquivosRaide = fs.readdirSync(pastaDestino).filter(file => file.endsWith('.json'));
    
    // O Esqueleto do nosso JSON de Relatório
    const relatorio = {
        resumo: {
            total_arquivos_verificados: arquivosRaide.length,
            arquivos_perfeitos: 0,
            arquivos_com_furos: 0
        },
        detalhes_dos_furos: []
    };

    console.log(`🔎 Inspecionando ${arquivosRaide.length} arquivos de Reide...\n`);

    for (const arquivo of arquivosRaide) {
        const caminhoCompleto = path.join(pastaDestino, arquivo);
        let dadosJSON;

        try {
            dadosJSON = JSON.parse(fs.readFileSync(caminhoCompleto, 'utf8'));
        } catch (e) {
            console.log(`⚠️ Aviso: Não consegui ler o arquivo ${arquivo} (pode estar corrompido).`);
            continue;
        }

        let categoriasComFuro = [];

        // Verifica cada categoria dentro do arquivo (ex: "average", "ice_shard_icy_wind")
        for (const categoria in dadosJSON) {
            const listaCounters = dadosJSON[categoria];
            
            // Se for uma lista válida e tiver menos de 30 Pokémon...
            if (Array.isArray(listaCounters) && listaCounters.length < 30) {
                categoriasComFuro.push({
                    categoria_do_ataque: categoria,
                    quantidade_encontrada: listaCounters.length,
                    faltam: 30 - listaCounters.length
                });
            }
        }

        // Se encontrou algum buraco nesse Chefe, anota no relatório!
        if (categoriasComFuro.length > 0) {
            relatorio.resumo.arquivos_com_furos++;
            relatorio.detalhes_dos_furos.push({
                arquivo: arquivo,
                chefe: arquivo.replace("counters_", "").replace(".json", "").toUpperCase(),
                problemas: categoriasComFuro
            });
            // Opcional: Mostra na tela para você ir acompanhando
            console.log(`   🚨 FURO ENCONTRADO: ${arquivo} tem categorias incompletas.`);
        } else {
            relatorio.resumo.arquivos_perfeitos++;
        }
    }

    // Grava o arquivo JSON com tudo bonitinho e identado
    fs.writeFileSync(arquivoAuditoria, JSON.stringify(relatorio, null, 4), 'utf8');

    console.log(`\n========================================================`);
    console.log(`🎉 AUDITORIA CONCLUÍDA!`);
    console.log(`✅ Perfeitos: ${relatorio.resumo.arquivos_perfeitos}`);
    console.log(`❌ Com Furos: ${relatorio.resumo.arquivos_com_furos}`);
    console.log(`📁 Abra o arquivo 'auditoria_furos.json' para ver onde estão os erros.`);
    console.log(`========================================================\n`);
}

// Roda o inspetor!
rodarAuditoria();