const fs = require('fs');

async function gerarRelatorio() {
    console.log("📥 Baixando banco de dados de Pokémon...");

    try {
        // Baixa os 3 arquivos principais do seu GitHub
        const [resPokes, resMega, resGiga] = await Promise.all([
            fetch("https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/poke_data.json").then(r => r.json()),
            fetch("https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/mega_reides.json").then(r => r.json()),
            fetch("https://cdn.jsdelivr.net/gh/nowadraco/blogger-poke-dragon-shadow@main/json/poke_data_gigamax.json").then(r => r.json())
        ]);

        // Junta tudo numa lista só
        const todosOsPokemons = [...resPokes, ...resMega, ...resGiga];
        
        console.log(`🔍 Analisando ${todosOsPokemons.length} Pokémon...`);

        // 1. Cria uma lista apenas com as informações que precisamos
        const listaProcessada = todosOsPokemons
            .filter(pokemon => pokemon && pokemon.speciesName) // Ignora dados vazios
            .map(pokemon => {
                const qtdFast = pokemon.fastMoves ? pokemon.fastMoves.length : 0;
                const qtdCharged = pokemon.chargedMoves ? pokemon.chargedMoves.length : 0;
                const combinacoes = qtdFast * qtdCharged;

                return {
                    nome: pokemon.speciesName,
                    qtdFast: qtdFast,
                    qtdCharged: qtdCharged,
                    combinacoes: combinacoes
                };
            });

        // 2. 🌟 ORDENA A LISTA (Da maior quantidade de combinações para a menor)
        listaProcessada.sort((a, b) => b.combinacoes - a.combinacoes);

        // 3. Monta o texto do arquivo
        let conteudoTexto = "";
        listaProcessada.forEach(pokemon => {
            conteudoTexto += `${pokemon.nome}\n`;
            conteudoTexto += `ataque rapidos: ${pokemon.qtdFast}\n`;
            conteudoTexto += `ataque carregado: ${pokemon.qtdCharged}\n`;
            conteudoTexto += `combinações: ${pokemon.combinacoes}\n`;
            conteudoTexto += `------------------\n`;
        });

        // 4. Salva o arquivo TXT na mesma pasta do script
        fs.writeFileSync('relatorio_ataques.txt', conteudoTexto, 'utf8');

        // Pega o campeão (agora é fácil, é só pegar o primeiro da lista!)
        const campeao = listaProcessada[0];

        console.log("\n✅ ARQUIVO GERADO COM SUCESSO: 'relatorio_ataques.txt'");
        console.log(`🏆 O Pokémon com mais combinações é o ${campeao.nome} com incríveis ${campeao.combinacoes} combos!`);

    } catch (erro) {
        console.error("❌ Erro ao gerar o relatório:", erro);
    }
}

// Executa a função
gerarRelatorio();