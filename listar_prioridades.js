const fs = require('fs');

// Usamos a URL RAW do Github para pegar sempre a versão em tempo real, sem cache!
const URL_RAID_BOSSES = "https://raw.githubusercontent.com/nowadraco/blogger-poke-dragon-shadow/main/json/dados_pogo/json/dados_pogo/raid_bosses/raid_bosses.json";

async function gerarListaPrioridade() {
    console.log("📥 Conectando ao Github para baixar a rotação de Reides...");
    
    try {
        // 1. Faz o download do JSON
        const response = await fetch(URL_RAID_BOSSES);
        if (!response.ok) {
            throw new Error(`Erro na rede: ${response.status}`);
        }
        const data = await response.json();

        // 2. Cabeçalho do arquivo de texto
        let textoFinal = "=================================================\n";
        textoFinal += "🎯 LISTA DE PRIORIDADE DE GERAÇÃO (MOTOR PVE 10.0)\n";
        textoFinal += "=================================================\n";
        textoFinal += "Use esta lista para saber quais Bosses digitar no gerador!\n\n";

        // 3. Vamos ler as abas de Bosses (Atuais e Anteriores)
        const abas = ["current", "previous"];

        abas.forEach(aba => {
            if (data[aba]) {
                const tituloAba = aba === "current" ? "🟢 BOSSES ATUAIS (GERAR PRIMEIRO)" : "🟡 BOSSES ANTERIORES (GERAR DEPOIS)";
                textoFinal += `\n${tituloAba}\n`;
                textoFinal += `-------------------------------------------------\n`;

                // Vasculha cada Tier dentro da aba
                for (const tier in data[aba]) {
                    const listaDeBosses = data[aba][tier];
                    
                    // Se a lista da Tier não estiver vazia
                    if (listaDeBosses && listaDeBosses.length > 0) {
                        textoFinal += `\n[ TIER ${tier.toUpperCase()} ]\n`;
                        
                        // Imprime cada Boss um embaixo do outro
                        listaDeBosses.forEach(boss => {
                            let nomeDoBicho = boss.name;
                            
                            // Se tiver uma forma diferente (Mega, Alola, etc), avisa no TXT
                            if (boss.form && boss.form.toLowerCase() !== "normal") {
                                nomeDoBicho += ` (${boss.form})`;
                            }
                            
                            textoFinal += `- ${nomeDoBicho}\n`;
                        });
                    }
                }
                textoFinal += `\n=================================================\n`;
            }
        });

        // 4. Salva tudo num arquivo .txt
        fs.writeFileSync("prioridade_reides.txt", textoFinal);
        console.log("✅ Sucesso! Abra o arquivo 'prioridade_reides.txt' para ver sua lista de tarefas!");

    } catch (error) {
        console.error("❌ Ocorreu um erro ao gerar a lista:", error);
    }
}

// Inicia o script
gerarListaPrioridade();