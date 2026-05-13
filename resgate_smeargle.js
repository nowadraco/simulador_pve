const fs = require('fs');
const path = require('path');

// Ajuste aqui se a sua pasta destino tiver outro nome
const pastaDestino = path.join(__dirname, 'json', 'simulacao_pve10'); 

// O nome do arquivo gigante que você quer quebrar
const nomeArquivoGigante = '_temp_counters_smeargle_t1.json';
const caminhoArquivoGigante = path.join(pastaDestino, nomeArquivoGigante);

// O nome da nova pasta fragmentada (baseada no nome do Boss e Tier)
const nomeNovaPasta = '_temp_smeargle_t1'; 
const caminhoNovaPasta = path.join(pastaDestino, nomeNovaPasta);

console.log("========================================================");
console.log("🚑 OPERAÇÃO DE RESGATE: Fatiando o arquivo gigante...");
console.log("========================================================\n");

if (!fs.existsSync(caminhoArquivoGigante)) {
    console.error(`❌ ERRO: O arquivo gigante '${nomeArquivoGigante}' não foi encontrado na pasta:`);
    console.error(caminhoArquivoGigante);
    process.exit(1);
}

// Cria a nova pasta se não existir
if (!fs.existsSync(caminhoNovaPasta)) {
    fs.mkdirSync(caminhoNovaPasta, { recursive: true });
}

try {
    console.log("⏳ Lendo 95MB de dados para a memória (isso pode levar alguns segundos)...");
    
    // Lê o arquivo gigante
    const conteudoBruto = fs.readFileSync(caminhoArquivoGigante, 'utf8');
    const dadosAgrupados = JSON.parse(conteudoBruto);
    
    const combosSalvos = Object.keys(dadosAgrupados);
    console.log(`✅ Arquivo lido com sucesso! Foram encontrados ${combosSalvos.length} combos já calculados.`);
    
    let contador = 0;
    
    // Fatiador: Salva cada combo como um arquivo independente
    for (const cenario of combosSalvos) {
        const caminhoFragmento = path.join(caminhoNovaPasta, `${cenario}.json`);
        
        // Se por acaso o fragmento já existir, ele pula
        if (!fs.existsSync(caminhoFragmento)) {
            fs.writeFileSync(caminhoFragmento, JSON.stringify(dadosAgrupados[cenario]));
            contador++;
        }
    }
    
    console.log(`\n🎉 SUCESSO ABSOLUTO! ${contador} fragmentos foram criados na pasta '${nomeNovaPasta}'.`);
    console.log(`Você já pode rodar o seu Gerador Principal novamente. Ele vai ler a pasta e continuar de onde parou!`);
    console.log(`\n⚠️ IMPORTANTE: Pode deletar o arquivo gigante '${nomeArquivoGigante}' manualmente agora para liberar espaço.`);

} catch (erro) {
    console.error("\n❌ Erro fatal durante o resgate:");
    console.error(erro);
    console.log("\n💡 Dica: Se o Node acusar falta de memória (Heap Out Of Memory), rode o script assim no terminal:");
    console.log("node --max-old-space-size=4096 resgate_smeargle.js");
}